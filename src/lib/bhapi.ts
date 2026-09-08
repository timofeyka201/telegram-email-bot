import { normalizeList, normalizeProduct } from "./normalize";
import type { Product } from "./types";

const BASE = (process.env.BHAPI_BASE || "https://bhapi.ru/1688/api/v1").replace(/\/+$/, "");
const TOKEN = process.env.BHAPI_TOKEN || "";
const TIMEOUT_MS = 25_000;

export const hasToken = () => TOKEN.length > 0;

export class ApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

// --- крошечный кэш: парсинг платный и медленный, повторы бьют по UX и по счёту
type Entry = { at: number; value: unknown };
const cache = new Map<string, Entry>();
const TTL = 30 * 60 * 1000;
const MAX_ENTRIES = 400;

function cacheGet(key: string): unknown | undefined {
  const e = cache.get(key);
  if (!e) return undefined;
  if (Date.now() - e.at > TTL) {
    cache.delete(key);
    return undefined;
  }
  // LRU: освежаем позицию
  cache.delete(key);
  cache.set(key, e);
  return e.value;
}

function cacheSet(key: string, value: unknown) {
  cache.set(key, { at: Date.now(), value });
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
}

export async function apiGet(path: string, params: Record<string, string | number>): Promise<unknown> {
  if (!TOKEN) throw new ApiError("Не задан BHAPI_TOKEN — добавьте его в .env.local", 401);

  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const key = url.toString();

  const cached = cacheGet(key);
  if (cached !== undefined) return cached;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "X-API-Token": TOKEN, Accept: "application/json" },
      signal: ctrl.signal,
      cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok) {
      throw new ApiError(shortError(text) || `Парсер ответил ${res.status}`, res.status);
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new ApiError("Парсер вернул не JSON", 502);
    }
    cacheSet(key, json);
    return json;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e instanceof Error && e.name === "AbortError") throw new ApiError("Парсер не ответил за 25 секунд", 504);
    throw new ApiError(e instanceof Error ? e.message : "Сеть недоступна", 502);
  } finally {
    clearTimeout(timer);
  }
}

function shortError(text: string): string | undefined {
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    for (const k of ["detail", "message", "error", "msg"]) {
      const v = j[k];
      if (typeof v === "string") return v.slice(0, 200);
    }
  } catch {
    /* не JSON — вернём undefined */
  }
  return text ? text.slice(0, 200) : undefined;
}

// ------------------------------------------------------------------ ссылки

/** «123456789», «detail.1688.com/offer/…», полная ссылка → канонический URL товара. */
export function toOfferUrl(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  if (/^\d{6,}$/.test(s)) return `https://detail.1688.com/offer/${s}.html`;
  const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withProto);
    if (!/1688\.com$/i.test(u.hostname) && !/\.1688\.com$/i.test(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function splitInputs(text: string): string[] {
  return text
    .split(/[\s,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 40);
}

// ------------------------------------------------------------- эндпоинты

/** Подтверждённый эндпоинт: товар по ссылке. */
export async function fetchByUrl(offerUrl: string): Promise<Product> {
  const raw = await apiGet("/item/by-url", { url: offerUrl });
  const product = normalizeProduct(raw, offerUrl);
  if (!product) throw new ApiError("Парсер вернул пустой ответ по этой ссылке", 422);
  return product;
}

/**
 * Поиск по ключевому слову. Точный путь в документации не зафиксирован, поэтому
 * пробуем известные варианты и запоминаем сработавший — дальше ходим сразу в него.
 */
const SEARCH_CANDIDATES: { path: string; q: string; page: string }[] = [
  { path: "/item/search", q: "q", page: "page" },
  { path: "/search", q: "q", page: "page" },
  { path: "/items/search", q: "keyword", page: "page" },
  { path: "/search/items", q: "keyword", page: "page" },
  { path: "/item/by-keyword", q: "keyword", page: "page" },
];

let workingSearch: (typeof SEARCH_CANDIDATES)[number] | null = null;

export async function search(query: string, page = 1): Promise<{ products: Product[]; endpoint: string }> {
  const order = workingSearch ? [workingSearch, ...SEARCH_CANDIDATES.filter((c) => c !== workingSearch)] : SEARCH_CANDIDATES;
  let lastError: ApiError | null = null;

  for (const cand of order) {
    try {
      const raw = await apiGet(cand.path, { [cand.q]: query, [cand.page]: page });
      const products = normalizeList(raw);
      if (products.length) {
        workingSearch = cand;
        return { products, endpoint: cand.path };
      }
      lastError = new ApiError(`Эндпоинт ${cand.path} ничего не нашёл`, 404);
    } catch (e) {
      lastError = e instanceof ApiError ? e : new ApiError(String(e));
      // 401/403 — проблема с токеном, перебирать пути бессмысленно
      if (lastError.status === 401 || lastError.status === 403) throw lastError;
    }
  }
  throw lastError ?? new ApiError("Поиск недоступен", 501);
}
