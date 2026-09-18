#!/usr/bin/env node
/**
 * Импорт товаров AliExpress через официальный партнёрский API.
 *
 * Почему именно он: площадка доступна из любой страны (в отличие от российских
 * маркетплейсов), отдаёт названия на нужном языке и цены в нужной валюте, а
 * каталог там измеряется миллионами позиций.
 *
 * Нужны ключи — бесплатные, из партнёрского кабинета portals.aliexpress.com:
 * App Key, App Secret и Tracking ID. Кладутся в .env.local или передаются флагами.
 *
 *   node scripts/build-catalog-aliexpress.mjs --check
 *   node scripts/build-catalog-aliexpress.mjs --target=1000 --push
 *   node scripts/build-catalog-aliexpress.mjs --lang=RU --currency=RUB --ship-to=RU
 */
import { createHash, createHmac } from "node:crypto";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { keepReal } from "./quality.mjs";

// ------------------------------------------------------------------ настройки
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);

/** Ключи читаем и из .env.local — чтобы не светить их в истории команд. */
function readEnvFile() {
  const out = {};
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in out)) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return out;
}
const env = { ...readEnvFile(), ...process.env };

const APP_KEY = String(args.key || env.ALI_APP_KEY || "");
const APP_SECRET = String(args.secret || env.ALI_APP_SECRET || "");
const TRACKING_ID = String(args["tracking-id"] || env.ALI_TRACKING_ID || "default");
const LANG = String(args.lang || env.ALI_LANG || "RU");
const CURRENCY = String(args.currency || env.ALI_CURRENCY || "RUB");
const SHIP_TO = String(args["ship-to"] || env.ALI_SHIP_TO || "RU");

const TARGET = Number(args.target || 1000);
const OUT = String(args.out || "data/catalog.json");
const PAGE_SIZE = Math.min(Number(args["page-size"] || 40), 50);
const MAX_PAGE = Number(args["max-page"] || 10);
const GAP_MS = Number(args.gap || 400);
const CHECK_ONLY = args.check === true;
const PUSH = args.push === true;

const QUERIES = args.queries
  ? String(args.queries).split(",").map((s) => s.trim()).filter(Boolean)
  : ["кроссовки", "куртка", "футболка", "платье", "рюкзак", "сумка", "наушники", "смартфон",
     "чехол для телефона", "повербанк", "клавиатура", "мышь", "умные часы", "колонка",
     "кофеварка", "блендер", "сковорода", "постельное бельё", "плед", "светильник",
     "органайзер", "термос", "инструменты", "гантели", "коврик для йоги", "палатка",
     "рюкзак туристический", "конструктор", "косметика", "духи"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------- подпись
/**
 * У площадки два шлюза с разными правилами подписи, и какой доступен
 * конкретному приложению — зависит от того, где оно заведено. Поддерживаем оба
 * и определяем рабочий проверкой.
 */
const GATEWAYS = {
  sg: {
    // Адрес переопределяется для зеркал и для проверки на стенде.
    url: env.ALI_GATEWAY_SG || "https://api-sg.aliexpress.com/sync",
    label: "api-sg.aliexpress.com (HMAC-SHA256)",
    timestamp: () => String(Date.now()),
    sign(params, secret) {
      const base = Object.keys(params).sort().map((k) => k + params[k]).join("");
      return createHmac("sha256", secret).update(base, "utf8").digest("hex").toUpperCase();
    },
    signMethod: "sha256",
  },
  top: {
    url: env.ALI_GATEWAY_TOP || "https://gw.api.taobao.com/router/rest",
    label: "gw.api.taobao.com (MD5)",
    timestamp: () => new Date().toISOString().replace("T", " ").slice(0, 19),
    sign(params, secret) {
      const base = Object.keys(params).sort().map((k) => k + params[k]).join("");
      return createHash("md5").update(secret + base + secret, "utf8").digest("hex").toUpperCase();
    },
    signMethod: "md5",
  },
};

let gateway = GATEWAYS[String(args.gateway || "")] || null;

async function call(method, business, gw) {
  const params = {
    app_key: APP_KEY,
    method,
    format: "json",
    v: "2.0",
    sign_method: gw.signMethod,
    timestamp: gw.timestamp(),
    ...business,
  };
  params.sign = gw.sign(params, APP_SECRET);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(gw.url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
      body: new URLSearchParams(params).toString(),
      signal: ctrl.signal,
    });
    const text = await res.text();
    try {
      return { status: res.status, json: JSON.parse(text), text };
    } catch {
      return { status: res.status, json: null, text };
    }
  } catch (e) {
    return { status: 0, json: null, text: "", error: e.message };
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------------- разбор
/** Ответ обёрнут в несколько слоёв, имена которых зависят от метода. */
function unwrap(json) {
  if (!json || typeof json !== "object") return null;
  const top = Object.keys(json).find((k) => k.endsWith("_response")) ?? Object.keys(json)[0];
  let node = json[top] ?? json;
  for (const key of ["resp_result", "result", "data"]) {
    if (node && typeof node === "object" && key in node) node = node[key];
  }
  return node;
}

/** Списки приходят как {products:{product:[…]}} либо просто массивом. */
function itemsOf(node) {
  if (!node || typeof node !== "object") return [];
  for (const key of ["products", "items", "product_list"]) {
    const v = node[key];
    if (Array.isArray(v)) return v;
    if (v && typeof v === "object") {
      for (const inner of ["product", "item", "traffic_product_d_t_o"]) {
        if (Array.isArray(v[inner])) return v[inner];
      }
      const firstArray = Object.values(v).find(Array.isArray);
      if (firstArray) return firstArray;
    }
  }
  return [];
}

const num = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string") {
    const m = v.replace(/\s/g, "").replace(",", ".").match(/-?\d+(\.\d+)?/);
    if (m) return Number(m[0]);
  }
  return undefined;
};

function imagesOf(p) {
  const out = [];
  const push = (v) => {
    if (typeof v !== "string") return;
    let s = v.trim();
    if (s.startsWith("//")) s = "https:" + s;
    if (/^https?:\/\//i.test(s) && !out.includes(s)) out.push(s);
  };
  push(p.product_main_image_url ?? p.image_url ?? p.main_image);
  const small = p.product_small_image_urls ?? p.small_image_urls;
  if (Array.isArray(small)) small.forEach(push);
  else if (small && typeof small === "object") {
    const arr = small.string ?? Object.values(small).find(Array.isArray);
    if (Array.isArray(arr)) arr.forEach(push);
    else if (typeof small.string === "string") small.string.split(",").forEach(push);
  }
  return out.slice(0, 6);
}

function toProduct(p, query) {
  const id = p.product_id ?? p.productId ?? p.item_id;
  const title = p.product_title ?? p.title ?? p.subject;
  if (id === undefined || typeof title !== "string" || !title.trim()) return null;

  const images = imagesOf(p);
  if (!images.length) return null;

  const price = num(p.target_sale_price ?? p.sale_price ?? p.app_sale_price);
  const was = num(p.target_original_price ?? p.original_price);
  const currency = String(p.target_sale_price_currency ?? p.sale_price_currency ?? CURRENCY).toUpperCase();
  // Рейтинг приходит долей положительных отзывов: «95.3%» → 4.8 из 5.
  const rate = num(p.evaluate_rate ?? p.evaluation_rate);
  const rating = rate !== undefined ? Math.round((rate / 100) * 5 * 10) / 10 : undefined;

  const category = p.second_level_category_name ?? p.first_level_category_name ?? query;
  const attributes = [
    ["Категория", category],
    ["Раздел", p.first_level_category_name],
    ["Магазин", p.shop_name],
    ["Скидка", p.discount],
    ["Заказов за месяц", p.lastest_volume !== undefined ? String(p.lastest_volume) : undefined],
    ["Доставка в", SHIP_TO],
  ].filter(([, v]) => typeof v === "string" && v.length).map(([name, value]) => ({ name, value }));

  return {
    id: `ae-${id}`,
    title: title.trim(),
    category: typeof category === "string" ? category : undefined,
    brand: undefined,
    url: p.product_detail_url ?? p.promotion_link ?? `https://www.aliexpress.com/item/${id}.html`,
    images,
    price,
    priceMax: was !== undefined && price !== undefined && was > price ? was : undefined,
    tiers: price !== undefined ? [{ from: 1, price }] : [],
    minOrder: 1,
    description: undefined,
    attributes,
    skus: [],
    seller: p.shop_name ? { name: String(p.shop_name), url: p.shop_url } : undefined,
    rating,
    reviewsCount: num(p.lastest_volume),
    soldCount: num(p.lastest_volume),
    reviews: [],
    currency,
    source: "local",
  };
}

// --------------------------------------------------------------- проверка
function explain(res) {
  const node = unwrap(res.json);
  const msg =
    node?.resp_msg ?? res.json?.error_response?.msg ?? res.json?.error_response?.sub_msg ?? null;
  const code = node?.resp_code ?? res.json?.error_response?.code ?? res.status;
  return msg ? `${code}: ${msg}` : `${code}`;
}

async function preflight() {
  if (!APP_KEY || !APP_SECRET) {
    console.error("\nНет ключей AliExpress.\n");
    console.error("Получите их бесплатно: portals.aliexpress.com → App Management,");
    console.error("затем добавьте в .env.local:\n");
    console.error("  ALI_APP_KEY=...");
    console.error("  ALI_APP_SECRET=...");
    console.error("  ALI_TRACKING_ID=...\n");
    return false;
  }

  const probe = { keywords: "наушники", page_no: 1, page_size: 5,
    target_language: LANG, target_currency: CURRENCY, ship_to_country: SHIP_TO, tracking_id: TRACKING_ID };

  const candidates = gateway ? [gateway] : Object.values(GATEWAYS);
  console.log("проверяем доступ:");
  for (const gw of candidates) {
    const res = await call("aliexpress.affiliate.product.query", probe, gw);
    const items = itemsOf(unwrap(res.json));
    const ok = items.length > 0;
    console.log(`  ${ok ? "✔" : "·"} ${gw.label}: ${ok ? `${items.length} товаров` : explain(res)}`);
    if (ok) {
      gateway = gw;
      return true;
    }
  }
  console.error("\nНи один шлюз не отдал товары.");
  console.error("Частые причины: ключи ещё не активированы, приложению не выдан доступ");
  console.error("к партнёрскому API, либо неверный Tracking ID.\n");
  return false;
}

// ------------------------------------------------------------------ сборка
const products = [];
const seen = new Set();

function save() {
  mkdirSync(OUT.replace(/\/[^/]+$/, ""), { recursive: true });
  writeFileSync(OUT, JSON.stringify({
    version: 1,
    kind: "aliexpress",
    generatedAt: new Date().toISOString().slice(0, 10),
    note: "Собрано через партнёрский API AliExpress. Фото не копируются — сохранены ссылки.",
    categories: [...new Set(products.map((p) => p.category).filter(Boolean))],
    products,
  }));
}

async function collect() {
  outer:
  for (const query of QUERIES) {
    for (let page = 1; page <= MAX_PAGE; page++) {
      if (products.length >= TARGET) break outer;

      const res = await call("aliexpress.affiliate.product.query", {
        keywords: query, page_no: page, page_size: PAGE_SIZE,
        target_language: LANG, target_currency: CURRENCY,
        ship_to_country: SHIP_TO, tracking_id: TRACKING_ID,
        sort: "LAST_VOLUME_DESC",
      }, gateway);

      const items = itemsOf(unwrap(res.json));
      if (!items.length) {
        if (page === 1) console.log(`«${query}»: пусто (${explain(res)})`);
        break;
      }

      let added = 0;
      for (const raw of items) {
        if (products.length >= TARGET) break;
        const p = toProduct(raw, query);
        if (!p || seen.has(p.id)) continue;
        seen.add(p.id);
        products.push(p);
        added++;
      }
      console.log(`«${query}» стр.${page}: +${added} → всего ${products.length}`);
      save();
      await sleep(GAP_MS);
    }
  }
}

async function finish() {
  const before = products.length;
  const good = keepReal(products);
  if (good.length !== before) {
    console.log(`\nотбраковано: ${before - good.length}`);
    products.length = 0;
    products.push(...good);
  }
  save();
  console.log(`\nготово: ${products.length} товаров, ${new Set(products.map((p) => p.category)).size} категорий`);
  console.log(`файл: ${OUT}`);

  if (PUSH && products.length) {
    const { execSync } = await import("node:child_process");
    try {
      execSync(`git add ${OUT}`, { stdio: "inherit" });
      execSync(`git commit -m "Update catalogue: ${products.length} products from AliExpress"`, { stdio: "inherit" });
      execSync("git push", { stdio: "inherit" });
      console.log("выложено — деплой подхватит базу");
    } catch {
      console.log(`выложить не удалось: git add ${OUT} && git commit -m "Update catalogue" && git push`);
    }
  }
}

console.log(`цель: ${TARGET} товаров, язык: ${LANG}, валюта: ${CURRENCY}, доставка: ${SHIP_TO}\n`);

if (!(await preflight())) {
  process.exitCode = 1;
} else if (CHECK_ONLY) {
  console.log("\nдоступ есть — можно запускать без --check");
} else {
  console.log("");
  await collect();
  await finish();
}
