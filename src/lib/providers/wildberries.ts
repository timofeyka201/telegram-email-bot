import { resolveWbHost, volPart, WB_REFERER, WB_UA } from "../wb-basket";
import type { Attribute, Product } from "../types";
import { decodeCursor, encodeCursor, type PageArgs, type Provider, type ProviderPage } from "./types";

/**
 * Wildberries: публичный поиск, которым пользуется сам сайт маркетплейса.
 * Ключ не нужен, всё на русском, каталог огромный — ленты хватает надолго.
 *
 * Две неочевидные вещи, ради которых здесь столько кода:
 *  1) цены приходят в копейках и в разных полях в зависимости от версии выдачи;
 *  2) ссылки на фото в ответе не приходят — их собирают из id товара, причём
 *     номер CDN-корзины зависит от диапазона, и диапазоны со временем меняются.
 *     Поэтому корзину не «зашиваем», а определяем запросом и кэшируем.
 */

const SEARCH_BASE = (process.env.WB_SEARCH_BASE || "https://search.wb.ru").replace(/\/+$/, "");
const BASKET_BASE = process.env.WB_BASKET_BASE || ""; // пусто — обычные basket-NN.wbbasket.ru
const PAGE_LIMIT = 60; // дальше выдача обычно пустеет
const TIMEOUT = 9_000; // под лимит serverless-функции

const UA = WB_UA;

/** Категории для ленты без запроса: перебираем их по кругу — так карточек тысячи. */
const TOPICS = [
  "кроссовки", "куртка", "джинсы", "футболка", "платье", "свитшот", "рюкзак", "сумка",
  "наушники", "смартфон", "чехол", "powerbank", "клавиатура", "мышь", "монитор", "ноутбук",
  "кофеварка", "блендер", "сковорода", "набор посуды", "постельное бельё", "плед", "штора", "ковёр",
  "кресло", "стол письменный", "полка", "светильник", "часы наручные", "очки солнцезащитные",
  "духи", "крем для лица", "шампунь", "маска для лица", "витамины", "гантели", "коврик для йоги",
  "палатка", "термос", "конструктор", "настольная игра", "кофе в зёрнах",
];

// ---------------------------------------------------------------- разбор ответа

type WbSize = { price?: { basic?: number; product?: number; total?: number } };
type WbItem = {
  id?: number;
  name?: string;
  brand?: string;
  supplier?: string;
  supplierRating?: number;
  reviewRating?: number;
  rating?: number;
  feedbacks?: number;
  pics?: number;
  totalQuantity?: number;
  entity?: string;
  salePriceU?: number;
  priceU?: number;
  sizes?: WbSize[];
  colors?: { name?: string }[];
};
type WbResponse = { data?: { products?: WbItem[] }; products?: WbItem[] };

/** Копейки → рубли, с перебором полей: выдача менялась от версии к версии. */
function pickPrices(it: WbItem): { price?: number; priceMax?: number } {
  const size = it.sizes?.[0]?.price;
  const now = size?.product ?? size?.total ?? it.salePriceU;
  const was = size?.basic ?? it.priceU;
  const toRub = (v?: number) => (typeof v === "number" && v > 0 ? Math.round(v) / 100 : undefined);
  const price = toRub(now);
  const old = toRub(was);
  return { price, priceMax: old !== undefined && price !== undefined && old > price ? old : undefined };
}

function attributes(it: WbItem): Attribute[] {
  const pairs: [string, unknown][] = [
    ["Бренд", it.brand],
    ["Продавец", it.supplier],
    ["Категория", it.entity],
    ["Цвет", it.colors?.map((c) => c.name).filter(Boolean).join(", ") || undefined],
    ["Рейтинг продавца", it.supplierRating !== undefined ? String(it.supplierRating) : undefined],
    ["Остаток", it.totalQuantity ? `${it.totalQuantity} шт.` : undefined],
  ];
  return pairs
    .filter((p): p is [string, string] => typeof p[1] === "string" && p[1].length > 0)
    .map(([name, value]) => ({ name, value }));
}

function toProduct(it: WbItem): Product | null {
  if (!it || typeof it.id !== "number" || !it.name) return null;
  const { price, priceMax } = pickPrices(it);
  const count = Math.min(Math.max(it.pics ?? 1, 1), 8);
  // Ссылку на CDN не угадываем заранее: прокси подберёт корзину в момент
  // запроса картинки и запомнит её — так карточка не остаётся с битым фото.
  const images = Array.from({ length: count }, (_, i) => `/api/img?wb=${it.id}&n=${i + 1}`);

  const rating = it.reviewRating ?? it.rating;
  return {
    id: `wb-${it.id}`,
    url: `https://www.wildberries.ru/catalog/${it.id}/detail.aspx`,
    title: it.name,
    images,
    price,
    priceMax,
    tiers: price !== undefined ? [{ from: 1, price }] : [],
    minOrder: 1,
    description: undefined, // подтягивается в карточке товара через /api/item
    attributes: attributes(it),
    skus: (it.colors ?? [])
      .map((c, i) => ({ id: `wb-${it.id}-c${i}`, name: c.name ?? "" }))
      .filter((s) => s.name.length > 0),
    seller: it.supplier ? { name: it.supplier, rating: it.supplierRating } : undefined,
    rating: typeof rating === "number" ? (rating > 5 ? rating / 10 : rating) : undefined,
    reviewsCount: it.feedbacks,
    soldCount: undefined,
    reviews: [],
    currency: "RUB",
    source: "wb",
  };
}

async function fetchSearch(query: string, page: number): Promise<WbItem[]> {
  const url =
    `${SEARCH_BASE}/exactmatch/ru/common/v13/search` +
    `?ab_testing=false&appType=1&curr=rub&dest=-1257786&hide_dtype=13` +
    `&lang=ru&page=${page}&query=${encodeURIComponent(query)}&resultset=catalog&sort=popular&spp=30`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "application/json", "User-Agent": UA },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Wildberries ответил ${res.status}`);
    const json = (await res.json()) as WbResponse;
    return json.data?.products ?? json.products ?? [];
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------- провайдер

export const wbProvider: Provider = {
  id: "wb",
  label: "Wildberries",
  note: "Публичный поиск маркетплейса: русский язык, цены в рублях, тысячи карточек. Без ключа.",
  needsToken: false,
  ready: () => true,

  async page({ query, cursor, seed }: PageArgs): Promise<ProviderPage> {
    // offset — номер страницы выдачи, round — индекс темы в списке.
    const { offset, round } = decodeCursor(cursor);
    let pageNo = offset || 1;
    let topic = round;
    let looped = false;

    const term = () => (query ? query : TOPICS[topic % TOPICS.length]);

    let items = await fetchSearch(term(), pageNo);

    // Страница пустая или выдача исчерпана — переходим к следующей теме.
    if (!items.length || pageNo > PAGE_LIMIT) {
      topic += 1;
      pageNo = 1;
      looped = query ? true : topic >= TOPICS.length;
      items = await fetchSearch(term(), pageNo);
      if (!items.length) return { products: [], cursor: encodeCursor(1, topic + 1), looped: true };
    }

    const mapped = items.map(toProduct).filter((p): p is Product => p !== null);
    // Ленту не перетасовываем: у Wildberries порядок «по популярности» осмысленный,
    // а seed нужен лишь чтобы разные сессии стартовали с разных тем.
    const products =
      topic > 0 ? mapped.map((p) => ({ ...p, id: `${p.id}-t${topic}` })) : mapped;
    void seed;

    return { products, cursor: encodeCursor(pageNo + 1, topic), looped };
  },
};

/** Стартовая тема зависит от сессии — иначе все видят одно и то же. */
export function startCursorFor(seed: number): string {
  return encodeCursor(1, seed % TOPICS.length);
}

/**
 * Описание и характеристики лежат не в выдаче, а в card.json на той же CDN.
 * Дотягиваем их, когда пользователь открывает карточку товара.
 */
export async function fetchCard(id: number): Promise<{ description?: string; attributes: Attribute[] }> {
  const host = await resolveWbHost(id);
  if (!host) return { attributes: [] };
  const { vol, part } = volPart(id);
  const url = `${host}/vol${vol}/part${part}/${id}/info/ru/card.json`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8_000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": UA, Referer: WB_REFERER },
    });
    if (!res.ok) return { attributes: [] };
    const json = (await res.json()) as {
      description?: string;
      options?: { name?: string; value?: string }[];
      grouped_options?: { options?: { name?: string; value?: string }[] }[];
      subj_name?: string;
    };
    const flat = [
      ...(json.options ?? []),
      ...(json.grouped_options ?? []).flatMap((g) => g.options ?? []),
    ];
    const attributes = flat
      .filter((o): o is { name: string; value: string } => !!o.name && !!o.value)
      .map((o) => ({ name: o.name.slice(0, 80), value: String(o.value).slice(0, 200) }))
      .slice(0, 40);
    return { description: json.description, attributes };
  } catch {
    return { attributes: [] };
  } finally {
    clearTimeout(timer);
  }
}
