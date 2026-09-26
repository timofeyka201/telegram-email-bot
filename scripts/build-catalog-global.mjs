#!/usr/bin/env node
/**
 * Сбор базы из источников, доступных отовсюду.
 *
 * Российские маркетплейсы закрывают зарубежные адреса, поэтому здесь — каталоги
 * без географических ограничений и без ключей. Названия у них английские: это
 * плата за то, что работает из любой страны.
 *
 *   node scripts/build-catalog-global.mjs                  # всё, что доступно
 *   node scripts/build-catalog-global.mjs --target=800
 *   node scripts/build-catalog-global.mjs --only=dummyjson
 *   node scripts/build-catalog-global.mjs --no-verify      # не проверять фото
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { keepReal, imageLooksReal } from "./quality.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const TARGET = Number(args.target || 1000);
const OUT = String(args.out || "data/catalog.json");
const ONLY = args.only ? String(args.only).toLowerCase() : null;
const VERIFY = args["no-verify"] !== true;
const PUSH = args.push === true;

// Базы можно подменить — для зеркал и для проверки на стенде.
const BASES = {
  dummyjson: (process.env.DUMMYJSON_BASE || "https://dummyjson.com").replace(/\/+$/, ""),
  platzi: (process.env.PLATZI_BASE || "https://api.escuelajs.co").replace(/\/+$/, ""),
  fakestore: (process.env.FAKESTORE_BASE || "https://fakestoreapi.com").replace(/\/+$/, ""),
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

async function getJson(url, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20000);
      const res = await fetch(url, { headers: { accept: "application/json", "user-agent": UA }, signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === tries) { console.warn(`   ${url.slice(0, 60)}…: ${e.message}`); return null; }
      await new Promise((r) => setTimeout(r, 800 * i));
    }
  }
  return null;
}

/** Ссылка на картинку, очищенная от мусора: часть каталогов хранит их как строку с кавычками. */
function cleanImage(raw) {
  if (typeof raw !== "string") return null;
  const s = raw.replace(/^[\s["']+|[\s\]"']+$/g, "").trim();
  if (!/^https?:\/\//i.test(s)) return null;
  return imageLooksReal(s) ? s : null;
}

/** Битые ссылки на фото встречаются часто — карточка без картинки ленте не нужна. */
async function imageWorks(url) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { method: "GET", headers: { range: "bytes=0-0", "user-agent": UA }, signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok && res.status !== 206) return false;
    return (res.headers.get("content-type") || "").startsWith("image/");
  } catch {
    return false;
  }
}

const money = (v) => (typeof v === "number" && v > 0 ? Math.round(v * 100) / 100 : undefined);

// ------------------------------------------------------------------ источники

async function fromDummyJson(limit) {
  const out = [];
  for (let skip = 0; skip < limit; skip += 30) {
    const data = await getJson(`${BASES.dummyjson}/products?limit=30&skip=${skip}`);
    const items = data?.products ?? [];
    if (!items.length) break;
    for (const p of items) {
      const images = (p.images ?? []).map(cleanImage).filter(Boolean);
      if (!images.length) continue;
      const price = money(p.price);
      out.push({
        id: `dj-${p.id}`,
        title: p.title,
        category: p.category,
        brand: p.brand || undefined,
        url: `${BASES.dummyjson}/products/${p.id}`,
        images: images.slice(0, 6),
        price,
        priceMax: p.discountPercentage
          ? money(price / (1 - p.discountPercentage / 100))
          : undefined,
        tiers: price !== undefined ? [{ from: 1, price }] : [],
        // minimumOrderQuantity выдуман вместе с набором: у розничной туши
        // «минимальная партия» равна сорока восьми. Не переносим, иначе
        // витрина выглядит оптовой.
        minOrder: 1,
        description: p.description,
        attributes: [
          ["Бренд", p.brand], ["Категория", p.category], ["Артикул", p.sku],
          ["Наличие", p.availabilityStatus], ["Остаток", p.stock ? `${p.stock} шт.` : null],
          ["Вес", p.weight ? `${p.weight} г` : null],
          ["Габариты", p.dimensions ? `${p.dimensions.width} × ${p.dimensions.height} × ${p.dimensions.depth} см` : null],
          ["Гарантия", p.warrantyInformation], ["Доставка", p.shippingInformation], ["Возврат", p.returnPolicy],
        ].filter(([, v]) => typeof v === "string" && v).map(([name, value]) => ({ name, value })),
        skus: [],
        seller: p.brand ? { name: p.brand } : undefined,
        rating: p.rating,
        reviewsCount: p.reviews?.length,
        reviews: (p.reviews ?? []).filter((r) => r.comment).map((r, i) => ({
          id: `dj-${p.id}-r${i}`, author: r.reviewerName, rating: r.rating,
          text: r.comment, date: (r.date || "").slice(0, 10), images: [],
        })),
        currency: "USD",
        source: "local",
      });
    }
  }
  return out;
}

async function fromPlatzi(limit) {
  const out = [];
  for (let offset = 0; offset < limit * 2 && out.length < limit; offset += 50) {
    const items = await getJson(`${BASES.platzi}/api/v1/products?offset=${offset}&limit=50`);
    if (!Array.isArray(items) || !items.length) break;
    for (const p of items) {
      const images = (p.images ?? []).map(cleanImage).filter(Boolean);
      if (!images.length || !p.title || typeof p.price !== "number") continue;
      const price = money(p.price);
      out.push({
        id: `pz-${p.id}`,
        title: p.title,
        category: p.category?.name,
        url: `${BASES.platzi}/api/v1/products/${p.id}`,
        images: images.slice(0, 4),
        price,
        tiers: price !== undefined ? [{ from: 1, price }] : [],
        minOrder: 1,
        description: p.description,
        attributes: [["Категория", p.category?.name]].filter(([, v]) => v).map(([name, value]) => ({ name, value })),
        skus: [], seller: undefined, reviews: [],
        currency: "USD", source: "local",
      });
    }
  }
  return out;
}

async function fromFakeStore() {
  const items = await getJson(`${BASES.fakestore}/products`);
  if (!Array.isArray(items)) return [];
  return items.flatMap((p) => {
    const img = cleanImage(p.image);
    if (!img || !p.title) return [];
    const price = money(p.price);
    return [{
      id: `fs-${p.id}`,
      title: p.title,
      category: p.category,
      url: `${BASES.fakestore}/products/${p.id}`,
      images: [img],
      price,
      tiers: price !== undefined ? [{ from: 1, price }] : [],
      minOrder: 1,
      description: p.description,
      attributes: [{ name: "Категория", value: String(p.category ?? "") }].filter((a) => a.value),
      skus: [], seller: undefined,
      rating: p.rating?.rate, reviewsCount: p.rating?.count, reviews: [],
      currency: "USD", source: "local",
    }];
  });
}

// -------------------------------------------------------------------- сборка
const SOURCES = [
  { id: "dummyjson", title: "DummyJSON", run: (n) => fromDummyJson(n) },
  { id: "platzi", title: "Platzi Fake Store", run: (n) => fromPlatzi(n) },
  { id: "fakestore", title: "FakeStore API", run: () => fromFakeStore() },
];

const chosen = ONLY ? SOURCES.filter((s) => s.id.includes(ONLY)) : SOURCES;
const products = [];
const seen = new Set();

console.log(`цель: ${TARGET} товаров, источников: ${chosen.length}, проверка фото: ${VERIFY ? "да" : "нет"}\n`);

for (const src of chosen) {
  if (products.length >= TARGET) break;
  process.stdout.write(`${src.title}: `);
  const got = await src.run(TARGET - products.length);
  let added = 0;
  for (const p of got) {
    if (products.length >= TARGET || seen.has(p.id)) continue;
    seen.add(p.id);
    products.push(p);
    added++;
  }
  console.log(`+${added} → всего ${products.length}`);
}

// Сначала выбрасываем заготовки и заглушки, и только потом тратим запросы на
// проверку оставшихся фотографий.
{
  const before = products.length;
  const good = keepReal(products);
  if (good.length !== before) {
    console.log(`\nотбраковано заготовок и заглушек: ${before - good.length}`);
    products.length = 0;
    products.push(...good);
  }
}

if (VERIFY && products.length) {
  console.log(`\nпроверяем первое фото у ${products.length} карточек…`);
  const BATCH = 12;
  const alive = [];
  for (let i = 0; i < products.length; i += BATCH) {
    const chunk = products.slice(i, i + BATCH);
    const ok = await Promise.all(chunk.map((p) => imageWorks(p.images[0])));
    chunk.forEach((p, k) => { if (ok[k]) alive.push(p); });
    process.stdout.write(`\r  проверено ${Math.min(i + BATCH, products.length)}/${products.length}, годных ${alive.length}`);
  }
  console.log("");
  products.length = 0;
  products.push(...alive);
}

mkdirSync(OUT.replace(/\/[^/]+$/, ""), { recursive: true });
writeFileSync(OUT, JSON.stringify({
  version: 1,
  kind: "global",
  generatedAt: new Date().toISOString().slice(0, 10),
  note: "Собрано scripts/build-catalog-global.mjs из открытых каталогов. Фото не копируются — сохранены ссылки.",
  categories: [...new Set(products.map((p) => p.category).filter(Boolean))],
  products,
}));

console.log(`\nготово: ${products.length} товаров, ${new Set(products.map((p) => p.category)).size} категорий`);
console.log(`файл: ${OUT}`);
if (!products.length) console.log("\nни один источник не ответил — запустите npm run probe и пришлите вывод");

if (PUSH && products.length) {
  const { execSync } = await import("node:child_process");
  try {
    execSync(`git add ${OUT}`, { stdio: "inherit" });
    execSync(`git commit -m "Update catalogue: ${products.length} products"`, { stdio: "inherit" });
    execSync("git push", { stdio: "inherit" });
    console.log("выложено — деплой подхватит базу");
  } catch {
    console.log(`выложить не удалось, сделайте вручную: git add ${OUT} && git commit -m "Update catalogue" && git push`);
  }
}
