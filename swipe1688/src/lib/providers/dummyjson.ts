import { normalizeList } from "../normalize";
import type { Attribute, Product, Review } from "../types";
import { decodeCursor, encodeCursor, shuffle, type PageArgs, type Provider, type ProviderPage } from "./types";

/**
 * Открытый каталог DummyJSON: бесплатный REST без ключа, ~194 товара с
 * настоящими фотографиями, отзывами, рейтингом и минимальной партией.
 * Используется как источник по умолчанию, пока нет токена парсера 1688.
 */

// Базу можно подменить (тесты, зеркало, свой прокси) — код от этого не зависит.
const BASE = (process.env.CATALOG_BASE || "https://dummyjson.com").replace(/\/+$/, "");
const PAGE = 12;
const TIMEOUT = 15_000;

type DjReview = { rating?: number; comment?: string; date?: string; reviewerName?: string };
type DjProduct = {
  id: number;
  title?: string;
  description?: string;
  category?: string;
  price?: number;
  discountPercentage?: number;
  rating?: number;
  stock?: number;
  tags?: string[];
  brand?: string;
  sku?: string;
  weight?: number;
  dimensions?: { width?: number; height?: number; depth?: number };
  warrantyInformation?: string;
  shippingInformation?: string;
  availabilityStatus?: string;
  returnPolicy?: string;
  minimumOrderQuantity?: number;
  reviews?: DjReview[];
  images?: string[];
  thumbnail?: string;
};
type DjResponse = { products?: DjProduct[]; total?: number };

let lastRaw: unknown = null;

async function get(path: string): Promise<DjResponse> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(BASE + path, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Каталог ответил ${res.status}`);
    const json = (await res.json()) as DjResponse;
    lastRaw = json;
    return json;
  } finally {
    clearTimeout(timer);
  }
}

function ruDate(iso?: string): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

function attributes(p: DjProduct): Attribute[] {
  const dim = p.dimensions;
  const pairs: [string, unknown][] = [
    ["Бренд", p.brand],
    ["Категория", p.category],
    ["Артикул", p.sku],
    ["Наличие", p.availabilityStatus],
    ["Остаток", p.stock !== undefined ? `${p.stock} шт.` : undefined],
    ["Вес", p.weight !== undefined ? `${p.weight} г` : undefined],
    [
      "Габариты",
      dim && dim.width && dim.height && dim.depth
        ? `${dim.width} × ${dim.height} × ${dim.depth} см`
        : undefined,
    ],
    ["Гарантия", p.warrantyInformation],
    ["Доставка", p.shippingInformation],
    ["Возврат", p.returnPolicy],
    ["Теги", p.tags?.length ? p.tags.join(", ") : undefined],
  ];
  return pairs
    .filter((pair): pair is [string, string] => typeof pair[1] === "string" && pair[1].length > 0)
    .map(([name, value]) => ({ name, value }));
}

function reviews(p: DjProduct): Review[] {
  return (p.reviews ?? [])
    .filter((r) => typeof r.comment === "string" && r.comment.trim().length > 0)
    .map((r, i) => ({
      id: `dj-${p.id}-r${i}`,
      author: r.reviewerName,
      rating: r.rating,
      text: r.comment!.trim(),
      date: ruDate(r.date),
      images: [],
    }));
}

export function toProduct(p: DjProduct): Product | null {
  if (!p || typeof p.id !== "number" || !p.title) return null;
  const images = (p.images ?? []).filter((s) => typeof s === "string" && /^https?:\/\//.test(s));
  if (!images.length && p.thumbnail) images.push(p.thumbnail);
  if (!images.length) return null; // карточка без фото ленте не нужна

  const price = typeof p.price === "number" ? p.price : undefined;
  const moq = p.minimumOrderQuantity && p.minimumOrderQuantity > 1 ? p.minimumOrderQuantity : undefined;
  // Скидка в каталоге задаётся процентом — показываем её как «цену до партии».
  const listPrice =
    price !== undefined && p.discountPercentage
      ? Math.round((price / (1 - p.discountPercentage / 100)) * 100) / 100
      : undefined;

  return {
    id: `dj-${p.id}`,
    url: `${BASE}/products/${p.id}`,
    title: p.title,
    images: images.slice(0, 12),
    price,
    priceMax: listPrice && price !== undefined && listPrice > price ? listPrice : undefined,
    tiers: price !== undefined ? [{ from: moq ?? 1, price }] : [],
    minOrder: moq,
    description: p.description,
    attributes: attributes(p),
    skus: [],
    seller: p.brand ? { name: p.brand, location: p.category } : undefined,
    rating: p.rating,
    reviewsCount: p.reviews?.length,
    soldCount: undefined,
    reviews: reviews(p),
    currency: "USD",
    source: "catalog",
  };
}

async function fetchWindow(query: string, skip: number): Promise<{ items: DjProduct[]; total: number }> {
  const path = query
    ? `/products/search?q=${encodeURIComponent(query)}&limit=${PAGE}&skip=${skip}`
    : `/products?limit=${PAGE}&skip=${skip}`;
  const data = await get(path);
  return { items: data.products ?? [], total: typeof data.total === "number" ? data.total : 0 };
}

export const catalogProvider: Provider = {
  id: "catalog",
  label: "Открытый каталог",
  note: "Настоящие фото, отзывы и рейтинги. Работает без ключа.",
  needsToken: false,
  ready: () => true,

  async page({ query, cursor, seed }: PageArgs): Promise<ProviderPage> {
    let { offset, round } = decodeCursor(cursor);
    let { items, total } = await fetchWindow(query, offset);
    let looped = false;

    // Каталог конечен: дойдя до края, начинаем новый круг с другим порядком,
    // поэтому лента для пользователя не заканчивается никогда.
    if (!items.length) {
      if (offset === 0) return { products: [], cursor: encodeCursor(0, round), looped: false };
      round += 1;
      offset = 0;
      looped = true;
      ({ items, total } = await fetchWindow(query, 0));
    }

    let mapped = items.map(toProduct).filter((p): p is Product => p !== null);
    // Страховка от изменения схемы: разбираем ответ универсальным нормализатором,
    // чтобы лента продолжала работать даже если поля переименуют.
    if (!mapped.length && lastRaw) {
      mapped = normalizeList(lastRaw, "catalog", "USD").filter((p) => p.images.length > 0);
    }

    const products = shuffle(mapped, seed + round * 7919 + offset).map((p) =>
      round > 0 ? { ...p, id: `${p.id}-r${round}` } : p,
    );

    const next = offset + PAGE;
    const wrapped = total > 0 && next >= total;
    return {
      products,
      cursor: wrapped ? encodeCursor(0, round + 1) : encodeCursor(next, round),
      looped,
    };
  },
};
