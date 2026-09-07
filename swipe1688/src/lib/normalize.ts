import type { Attribute, PriceTier, Product, Review, Seller, Sku } from "./types";

/**
 * Схема ответа парсера заранее не зафиксирована, поэтому нормализация построена
 * не на жёстких путях, а на поиске полей по смыслу: обход JSON в ширину и выбор
 * первого правдоподобного значения. Так адаптер переживает переименования полей
 * и разные формы ответа (item / data.item / result.data и т.д.).
 */

type Json = unknown;
type Rec = Record<string, unknown>;

const isObj = (v: Json): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const isArr = (v: Json): v is unknown[] => Array.isArray(v);

/** Оболочки, внутрь которых нужно провалиться, прежде чем искать поля товара. */
const ENVELOPE_KEYS = ["data", "result", "item", "payload", "response", "product", "offer", "body"];

export function unwrapEnvelope(raw: Json): Rec {
  let node: Json = raw;
  for (let i = 0; i < 6; i++) {
    if (!isObj(node)) break;
    const keys = Object.keys(node);
    // Проваливаемся только если оболочка почти пустая — иначе можно потерять
    // поля верхнего уровня (например, отзывы рядом с data).
    const hit = ENVELOPE_KEYS.find((k) => isObj(node as Rec) && isObj((node as Rec)[k]));
    if (hit && keys.length <= 5) {
      node = (node as Rec)[hit];
      continue;
    }
    break;
  }
  return isObj(node) ? node : isObj(raw) ? (raw as Rec) : {};
}

type Visit = { key: string; value: unknown; depth: number; parent: Rec };

/** Обход в ширину: чем ближе поле к корню, тем оно приоритетнее. */
function bfs(root: Json, maxDepth = 6): Visit[] {
  const out: Visit[] = [];
  const queue: { node: Json; depth: number }[] = [{ node: root, depth: 0 }];
  const seen = new Set<unknown>();
  while (queue.length) {
    const { node, depth } = queue.shift()!;
    if (depth > maxDepth || node === null || typeof node !== "object") continue;
    if (seen.has(node)) continue;
    seen.add(node);
    if (isArr(node)) {
      for (const v of node.slice(0, 60)) queue.push({ node: v, depth: depth + 1 });
      continue;
    }
    const rec = node as Rec;
    for (const [key, value] of Object.entries(rec)) {
      out.push({ key, value, depth, parent: rec });
      if (value && typeof value === "object") queue.push({ node: value, depth: depth + 1 });
    }
  }
  return out;
}

function findAll(nodes: Visit[], key: RegExp, ok: (v: unknown) => boolean): unknown[] {
  return nodes.filter((n) => key.test(n.key) && ok(n.value)).map((n) => n.value);
}

function findFirst<T>(nodes: Visit[], key: RegExp, ok: (v: unknown) => v is T): T | undefined {
  for (const n of nodes) if (key.test(n.key) && ok(n.value)) return n.value;
  return undefined;
}

// ---------------------------------------------------------------- примитивы

export function toNum(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string") {
    const m = v.replace(/,/g, ".").match(/-?\d+(?:\.\d+)?/);
    if (m) {
      const n = Number(m[0]);
      return Number.isFinite(n) ? n : undefined;
    }
  }
  return undefined;
}

/** «12.00-30.00» → [12, 30] */
function toRange(v: unknown): [number | undefined, number | undefined] {
  if (typeof v === "string") {
    const all = v.replace(/,/g, ".").match(/\d+(?:\.\d+)?/g);
    if (all && all.length >= 2) return [Number(all[0]), Number(all[all.length - 1])];
  }
  const n = toNum(v);
  return [n, undefined];
}

const IMG_RE = /\.(jpe?g|png|webp|gif|avif)(\?|$)/i;

export function toImageUrl(v: unknown): string | undefined {
  let s: string | undefined;
  if (typeof v === "string") s = v;
  else if (isObj(v)) {
    for (const k of ["url", "src", "image", "img", "big", "large", "fullPathImageURI", "imageURI", "picUrl"]) {
      const c = v[k];
      if (typeof c === "string") {
        s = c;
        break;
      }
    }
  }
  if (!s) return undefined;
  s = s.trim();
  if (s.startsWith("//")) s = "https:" + s;
  if (!/^https?:\/\//i.test(s)) return undefined;
  if (!IMG_RE.test(s) && !/alicdn|1688|taobao|aliyun/i.test(s)) return undefined;
  // Убираем ресайз-суффиксы alicdn (…_.jpg_220x220.jpg) — берём оригинал.
  s = s.replace(/\.(jpg|jpeg|png|webp)_\d+x\d+.*$/i, ".$1");
  return s;
}

function stripHtml(s: string): string {
  return s
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ------------------------------------------------------------- извлечение

function extractId(root: Rec, nodes: Visit[], url: string): string {
  const fromUrl = url.match(/(?:offer\/|[?&](?:offerId|id)=)(\d{6,})/i)?.[1];
  if (fromUrl) return fromUrl;
  const cand = findFirst(
    nodes,
    /^(offer_?id|item_?id|product_?id|num_?iid|goods_?id|id)$/i,
    (v): v is string | number => typeof v === "number" || (typeof v === "string" && /^\d{6,}$/.test(v)),
  );
  if (cand !== undefined) return String(cand);
  return "p" + Math.abs(hash(JSON.stringify(root).slice(0, 4000))).toString(36);
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

function extractTitle(nodes: Visit[]): string {
  const v = findFirst(
    nodes,
    /^(title|subject|name|product_?name|goods_?name|item_?name|offer_?title|title_?ru|title_?translated|translated_?title)$/i,
    (x): x is string => typeof x === "string" && x.trim().length > 3 && x.trim().length < 400,
  );
  return v ? stripHtml(v) : "Без названия";
}

function extractImages(nodes: Visit[]): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    const u = toImageUrl(v);
    if (u && !out.includes(u)) out.push(u);
  };
  const imageKey = /^(images?|imgs?|pics?|pictures?|photos?|item_?imgs?|main_?images?|gallery|image_?urls?|pic_?url|image_?url|main_?pic|primary_?image|cover)$/i;
  for (const n of nodes) {
    if (!imageKey.test(n.key)) continue;
    if (isArr(n.value)) n.value.slice(0, 30).forEach(push);
    else push(n.value);
    if (out.length >= 15) break;
  }
  if (out.length === 0) {
    // Последняя попытка: любая строка, похожая на картинку.
    for (const n of nodes) {
      if (typeof n.value === "string" && IMG_RE.test(n.value)) push(n.value);
      if (out.length >= 10) break;
    }
  }
  return out.slice(0, 15);
}

function extractTiers(nodes: Visit[]): PriceTier[] {
  const tiers: PriceTier[] = [];
  const arrays = findAll(nodes, /(price_?range|ladder|tier|quantity_?price|price_?list|sale_?price_?range|steps?)/i, isArr) as unknown[][];
  for (const arr of arrays) {
    for (const it of arr) {
      if (!isObj(it)) continue;
      const from = toNum(it.beginAmount ?? it.begin_amount ?? it.from ?? it.min ?? it.minQuantity ?? it.startQuantity ?? it.quantity ?? it.begin);
      const price = toNum(it.price ?? it.value ?? it.unitPrice ?? it.unit_price ?? it.amount);
      if (price === undefined) continue;
      tiers.push({ from: from ?? 1, to: toNum(it.endAmount ?? it.to ?? it.max ?? it.maxQuantity), price });
    }
    if (tiers.length) break;
  }
  return tiers.sort((a, b) => a.from - b.from);
}

function extractPrice(nodes: Visit[], tiers: PriceTier[]): { price?: number; priceMax?: number } {
  if (tiers.length) {
    const ps = tiers.map((t) => t.price);
    return { price: Math.min(...ps), priceMax: Math.max(...ps) };
  }
  const raw = nodes.find(
    (n) =>
      /^(price|now_?price|sale_?price|min_?price|unit_?price|price_?text|promotion_?price|discount_?price|current_?price|price_?range)$/i.test(n.key) &&
      (typeof n.value === "string" || typeof n.value === "number"),
  );
  if (raw) {
    const [a, b] = toRange(raw.value);
    if (a !== undefined) {
      const max = toNum(findFirst(nodes, /^max_?price$/i, (v): v is string | number => typeof v === "string" || typeof v === "number"));
      return { price: a, priceMax: b ?? max };
    }
  }
  const nested = findFirst(nodes, /^(price|price_?info|prices)$/i, isObj);
  if (nested) {
    const a = toNum(nested.min ?? nested.value ?? nested.amount ?? nested.price);
    const b = toNum(nested.max ?? nested.maxPrice);
    if (a !== undefined) return { price: a, priceMax: b };
  }
  return {};
}

function extractDescription(nodes: Visit[]): string | undefined {
  const v = findFirst(
    nodes,
    /^(description|desc|detail|details|content|body|item_?desc|description_?ru|detail_?html|desc_?html|summary)$/i,
    (x): x is string => typeof x === "string" && x.trim().length > 20,
  );
  if (!v) return undefined;
  const text = stripHtml(v);
  return text.length > 20 ? text.slice(0, 4000) : undefined;
}

function extractAttributes(nodes: Visit[]): Attribute[] {
  const out: Attribute[] = [];
  const arrays = findAll(nodes, /^(attributes?|attrs?|props?|properties|specs?|specifications?|params?|features?)$/i, isArr) as unknown[][];
  for (const arr of arrays) {
    for (const it of arr) {
      if (isObj(it)) {
        const name = it.name ?? it.attrName ?? it.attr_name ?? it.key ?? it.title ?? it.label;
        const value = it.value ?? it.attrValue ?? it.attr_value ?? it.val ?? it.text;
        if (typeof name === "string" && (typeof value === "string" || typeof value === "number")) {
          out.push({ name: stripHtml(name).slice(0, 80), value: stripHtml(String(value)).slice(0, 200) });
        }
      }
    }
    if (out.length) break;
  }
  if (!out.length) {
    const obj = findFirst(nodes, /^(attributes?|attrs?|props?|specs?|properties)$/i, isObj);
    if (obj) {
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === "string" || typeof v === "number") out.push({ name: k, value: String(v) });
      }
    }
  }
  return out.slice(0, 40);
}

function extractSkus(nodes: Visit[]): Sku[] {
  const out: Sku[] = [];
  const arrays = findAll(nodes, /^(skus?|variants?|offers?|sku_?list|sku_?props?|options?)$/i, isArr) as unknown[][];
  for (const arr of arrays) {
    for (const it of arr) {
      if (!isObj(it)) continue;
      const name =
        it.name ?? it.title ?? it.specName ?? it.spec_name ?? it.propertyValue ?? it.value ?? it.skuName ?? it.sku_name;
      if (typeof name !== "string" && typeof name !== "number") continue;
      out.push({
        id: String(it.id ?? it.skuId ?? it.sku_id ?? out.length),
        name: stripHtml(String(name)).slice(0, 120),
        image: toImageUrl(it.image ?? it.img ?? it.pic ?? it.imageUrl ?? it.picUrl),
        price: toNum(it.price ?? it.salePrice ?? it.unitPrice),
        stock: toNum(it.stock ?? it.quantity ?? it.amountOnSale ?? it.canBookCount),
      });
    }
    if (out.length) break;
  }
  return out.slice(0, 60);
}

function extractReviews(nodes: Visit[]): Review[] {
  const out: Review[] = [];
  const arrays = findAll(
    nodes,
    /^(reviews?|comments?|feedbacks?|evaluations?|rate_?list|review_?list|comment_?list)$/i,
    isArr,
  ) as unknown[][];
  for (const arr of arrays) {
    for (const it of arr) {
      if (!isObj(it)) continue;
      const text = it.content ?? it.text ?? it.comment ?? it.review ?? it.body ?? it.feedback;
      if (typeof text !== "string" || text.trim().length < 2) continue;
      const imgs: string[] = [];
      for (const k of ["images", "imgs", "pics", "photos", "image"]) {
        const v = it[k];
        if (isArr(v)) v.forEach((x) => { const u = toImageUrl(x); if (u) imgs.push(u); });
        else { const u = toImageUrl(v); if (u) imgs.push(u); }
      }
      out.push({
        id: String(it.id ?? it.reviewId ?? out.length),
        author: typeof it.author === "string" ? it.author : typeof it.user === "string" ? it.user : typeof it.nick === "string" ? it.nick : undefined,
        rating: toNum(it.rating ?? it.score ?? it.star ?? it.stars),
        text: stripHtml(text).slice(0, 1200),
        date: typeof it.date === "string" ? it.date : typeof it.time === "string" ? it.time : typeof it.created_at === "string" ? it.created_at : undefined,
        images: imgs.slice(0, 6),
        sku: typeof it.sku === "string" ? it.sku : typeof it.specInfo === "string" ? it.specInfo : undefined,
      });
    }
    if (out.length) break;
  }
  return out.slice(0, 50);
}

function extractSeller(nodes: Visit[]): Seller | undefined {
  const obj = findFirst(nodes, /^(seller|shop|store|supplier|company|vendor)$/i, isObj);
  const seller: Seller = {};
  if (obj) {
    const name = obj.name ?? obj.title ?? obj.shopName ?? obj.companyName ?? obj.nick;
    if (typeof name === "string") seller.name = stripHtml(name).slice(0, 120);
    const url = obj.url ?? obj.shopUrl ?? obj.link;
    if (typeof url === "string") seller.url = url;
    const loc = obj.location ?? obj.city ?? obj.address ?? obj.province;
    if (typeof loc === "string") seller.location = stripHtml(loc).slice(0, 80);
    seller.years = toNum(obj.years ?? obj.tpYear ?? obj.year);
    seller.rating = toNum(obj.rating ?? obj.score ?? obj.starLevel);
  }
  if (!seller.name) {
    const n = findFirst(nodes, /^(shop_?name|seller_?name|company_?name|store_?name|supplier_?name)$/i, (v): v is string => typeof v === "string" && v.length > 1);
    if (n) seller.name = stripHtml(n).slice(0, 120);
  }
  return Object.values(seller).some((v) => v !== undefined) ? seller : undefined;
}

// ------------------------------------------------------------------ сборка

export function normalizeProduct(raw: Json, fallbackUrl = ""): Product | null {
  const root = unwrapEnvelope(raw);
  const nodes = bfs(root);
  if (!nodes.length) return null;

  const url =
    findFirst(nodes, /^(url|detail_?url|item_?url|product_?url|link|offer_?url)$/i, (v): v is string =>
      typeof v === "string" && /^https?:\/\//.test(v),
    ) || fallbackUrl;

  const id = extractId(root, nodes, url || fallbackUrl);
  const tiers = extractTiers(nodes);
  const { price, priceMax } = extractPrice(nodes, tiers);
  const images = extractImages(nodes);
  const title = extractTitle(nodes);

  // Совсем пустой объект (например, {"error": "..."}) товаром не считаем.
  if (title === "Без названия" && images.length === 0 && price === undefined) return null;

  return {
    id,
    url: url || `https://detail.1688.com/offer/${id}.html`,
    title,
    images,
    price,
    priceMax: priceMax && priceMax !== price ? priceMax : undefined,
    tiers,
    minOrder: toNum(
      findFirst(nodes, /^(min_?order|moq|begin_?amount|min_?quantity|min_?buy)$/i, (v): v is string | number =>
        typeof v === "string" || typeof v === "number",
      ),
    ),
    description: extractDescription(nodes),
    attributes: extractAttributes(nodes),
    skus: extractSkus(nodes),
    seller: extractSeller(nodes),
    rating: toNum(findFirst(nodes, /^(rating|score|star|stars|avg_?rating)$/i, (v): v is string | number => typeof v === "string" || typeof v === "number")),
    reviewsCount: toNum(findFirst(nodes, /^(reviews?_?count|comment_?count|rate_?count|feedback_?count|total_?reviews)$/i, (v): v is string | number => typeof v === "string" || typeof v === "number")),
    soldCount: toNum(findFirst(nodes, /^(sold|sales?|sold_?count|sale_?count|trade_?count|sold_?out)$/i, (v): v is string | number => typeof v === "string" || typeof v === "number")),
    reviews: extractReviews(nodes),
    source: "api",
  };
}

/** Ответ поиска: массив товаров может лежать где угодно — ищем самый «товарный». */
export function normalizeList(raw: Json): Product[] {
  const root = unwrapEnvelope(raw);
  const nodes = bfs(root, 5);
  const candidates = [
    ...findAll(nodes, /^(items?|products?|offers?|goods|list|results?|docs|rows|data|content)$/i, isArr),
    ...(isArr(raw) ? [raw] : []),
  ] as unknown[][];

  let best: Product[] = [];
  for (const arr of candidates) {
    const mapped = arr
      .slice(0, 60)
      .map((it) => normalizeProduct(it))
      .filter((p): p is Product => p !== null);
    if (mapped.length > best.length) best = mapped;
  }
  return best;
}
