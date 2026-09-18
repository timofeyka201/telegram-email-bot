#!/usr/bin/env node
/**
 * Наполнение собственной базы настоящими товарами Wildberries.
 *
 * Запускается с обычной машины: маркетплейс отвечает отказом на запросы из
 * дата-центров (именно поэтому живой источник не работал на Vercel), а с
 * домашнего или офисного адреса выдача открыта.
 *
 * Что сохраняется: название, цена, рейтинг, число отзывов, продавец,
 * характеристики, описание, ссылка на карточку и ССЫЛКИ на фотографии.
 * Сами файлы изображений не скачиваются и не перезаливаются — карточка
 * ссылается на оригинал, браузер грузит его напрямую.
 *
 *   node scripts/build-catalog.mjs                 # 1000 товаров
 *   node scripts/build-catalog.mjs --target=2000   # больше
 *   node scripts/build-catalog.mjs --no-cards      # без описаний (быстрее)
 *   node scripts/build-catalog.mjs --queries="дрель,шуруповёрт"
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";

// ----------------------------------------------------------------- параметры
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const TARGET = Number(args.target || 1000);
const OUT = String(args.out || "data/catalog.json");
const WITH_CARDS = args["no-cards"] !== true;
const MAX_PAGE = Number(args["max-page"] || 8);
const GAP_MS = Number(args.gap || 450);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const REFERER = "https://www.wildberries.ru/";

const SEARCH_BASE = (process.env.WB_SEARCH_BASE || "https://search.wb.ru").replace(/\/+$/, "");
const BASKET_BASE = process.env.WB_BASKET_BASE || "";
const PUSH = args.push === true;

const QUERIES = args.queries
  ? String(args.queries).split(",").map((s) => s.trim()).filter(Boolean)
  : ["кроссовки","куртка","джинсы","футболка","платье","свитшот","худи","рюкзак","сумка","кошелёк",
     "наушники","смартфон","чехол для телефона","повербанк","клавиатура","мышь","монитор","ноутбук","колонка","роутер",
     "кофеварка","блендер","чайник электрический","сковорода","набор посуды","мультиварка","микроволновка",
     "постельное бельё","плед","штора","ковёр","подушка","полотенце",
     "кресло компьютерное","стол письменный","полка настенная","светильник","торшер",
     "часы наручные","очки солнцезащитные","духи","крем для лица","шампунь","витамины",
     "гантели","коврик для йоги","палатка","термос","рюкзак туристический","конструктор","настольная игра"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------- запросы
async function getJson(url, tries = 5) {
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": UA, Referer: REFERER, "Accept-Language": "ru-RU,ru;q=0.9" },
      });
      if (res.status === 429 || res.status === 503) {
        const wait = 1500 * attempt * attempt;
        console.warn(`   лимит ${res.status}, пауза ${Math.round(wait / 1000)}с (попытка ${attempt}/${tries})`);
        await sleep(wait);
        continue;
      }
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      if (attempt === tries) {
        console.warn(`   сеть: ${e.message}`);
        return null;
      }
      await sleep(1000 * attempt);
    }
  }
  return null;
}

function searchUrl(query, page) {
  return `${SEARCH_BASE}/exactmatch/ru/common/v13/search?ab_testing=false&appType=1&curr=rub` +
    `&dest=-1257786&hide_dtype=13&lang=ru&page=${page}&query=${encodeURIComponent(query)}` +
    `&resultset=catalog&sort=popular&spp=30&suppressSpellcheck=false`;
}

// ------------------------------------------------------- подбор CDN-корзины
const VARIANTS = ["big/%N.webp", "c516x688/%N.webp", "big/%N.jpg"];
const basketCache = new Map();

const volPart = (id) => ({ vol: Math.floor(id / 100000), part: Math.floor(id / 1000) });
const host = (n) => (BASKET_BASE ? `${BASKET_BASE}/b${n}` : `https://basket-${String(n).padStart(2, "0")}.wbbasket.ru`);
const imgUrl = (h, id, n, variant) => {
  const { vol, part } = volPart(id);
  return `${h}/vol${vol}/part${part}/${id}/images/${variant.replace("%N", String(n))}`;
};

function guessBasket(vol) {
  const table = [[143,1],[287,2],[431,3],[719,4],[1007,5],[1061,6],[1115,7],[1169,8],[1313,9],[1601,10],
    [1655,11],[1919,12],[2045,13],[2189,14],[2405,15],[2621,16],[2837,17],[3053,18],[3269,19],[3485,20],
    [3701,21],[3917,22],[4133,23],[4349,24],[4565,25]];
  for (const [max, n] of table) if (vol <= max) return n;
  return Math.min(40, 26 + Math.floor((vol - 4565) / 250));
}

async function probe(url) {
  try {
    const res = await fetch(url, {
      headers: { Range: "bytes=0-0", "User-Agent": UA, Referer: REFERER, Accept: "image/*" },
    });
    if (!res.ok && res.status !== 206) return false;
    return (res.headers.get("content-type") || "").startsWith("image/");
  } catch {
    return false;
  }
}

/** Возвращает { host, variant } для диапазона id — один подбор на диапазон. */
async function resolveBasket(id) {
  const { vol } = volPart(id);
  if (basketCache.has(vol)) return basketCache.get(vol);

  const first = guessBasket(vol);
  const order = [];
  for (let d = 0; d <= 40; d++) {
    for (const n of d === 0 ? [first] : [first + d, first - d]) {
      if (n >= 1 && n <= 40 && !order.includes(n)) order.push(n);
    }
  }
  for (const variant of VARIANTS) {
    for (let i = 0; i < order.length; i += 8) {
      const batch = order.slice(i, i + 8);
      const found = await Promise.all(batch.map(async (n) => ((await probe(imgUrl(host(n), id, 1, variant))) ? n : null)));
      const hit = found.find((n) => n !== null);
      if (hit) {
        const res = { host: host(hit), variant };
        basketCache.set(vol, res);
        return res;
      }
    }
  }
  basketCache.set(vol, null);
  return null;
}

// --------------------------------------------------------------- разбор
function pickPrices(it) {
  const size = it.sizes?.[0]?.price;
  const toRub = (v) => (typeof v === "number" && v > 0 ? Math.round(v) / 100 : undefined);
  const price = toRub(size?.product ?? size?.total ?? it.salePriceU);
  const old = toRub(size?.basic ?? it.priceU);
  return { price, priceMax: old !== undefined && price !== undefined && old > price ? old : undefined };
}

async function fetchCard(id, basket) {
  if (!basket) return { description: undefined, attributes: [] };
  const { vol, part } = volPart(id);
  const json = await getJson(`${basket.host}/vol${vol}/part${part}/${id}/info/ru/card.json`, 2);
  if (!json) return { description: undefined, attributes: [] };
  const flat = [...(json.options ?? []), ...(json.grouped_options ?? []).flatMap((g) => g.options ?? [])];
  return {
    description: typeof json.description === "string" ? json.description.slice(0, 4000) : undefined,
    attributes: flat
      .filter((o) => o?.name && o?.value)
      .map((o) => ({ name: String(o.name).slice(0, 80), value: String(o.value).slice(0, 200) }))
      .slice(0, 40),
  };
}

async function toProduct(it, category) {
  if (!it?.id || !it?.name) return null;
  const basket = await resolveBasket(it.id);
  if (!basket) return null; // без фотографий карточка ленте не нужна

  const { price, priceMax } = pickPrices(it);
  const count = Math.min(Math.max(it.pics ?? 1, 1), 6);
  const images = Array.from({ length: count }, (_, i) => imgUrl(basket.host, it.id, i + 1, basket.variant));

  const base = [
    ["Бренд", it.brand],
    ["Продавец", it.supplier],
    ["Категория", category],
    ["Цвет", it.colors?.map((c) => c.name).filter(Boolean).join(", ")],
    ["Остаток", it.totalQuantity ? `${it.totalQuantity} шт.` : undefined],
  ].filter(([, v]) => typeof v === "string" && v.length).map(([name, value]) => ({ name, value }));

  const card = WITH_CARDS ? await fetchCard(it.id, basket) : { description: undefined, attributes: [] };
  const known = new Set(base.map((a) => a.name.toLowerCase()));
  const attributes = [...base, ...card.attributes.filter((a) => !known.has(a.name.toLowerCase()))];

  const rating = it.reviewRating ?? it.rating;
  return {
    id: `wb-${it.id}`,
    title: it.name,
    category,
    brand: it.brand || undefined,
    url: `https://www.wildberries.ru/catalog/${it.id}/detail.aspx`,
    images,
    price, priceMax,
    tiers: price !== undefined ? [{ from: 1, price }] : [],
    minOrder: 1,
    description: card.description,
    attributes,
    skus: (it.colors ?? []).map((c, i) => ({ id: `wb-${it.id}-c${i}`, name: c.name })).filter((s) => s.name),
    seller: it.supplier ? { name: it.supplier, rating: it.supplierRating } : undefined,
    rating: typeof rating === "number" ? (rating > 5 ? rating / 10 : rating) : undefined,
    reviewsCount: it.feedbacks,
    reviews: [],
    currency: "RUB",
    source: "local",
  };
}

// ----------------------------------------------------------------- основной
function save(products) {
  mkdirSync(OUT.replace(/\/[^/]+$/, ""), { recursive: true });
  writeFileSync(OUT, JSON.stringify({
    version: 1,
    kind: "wildberries",
    generatedAt: new Date().toISOString().slice(0, 10),
    note: "Собрано scripts/build-catalog.mjs. Фотографии не копируются — сохранены ссылки на оригиналы.",
    categories: [...new Set(products.map((p) => p.category))],
    products,
  }));
}

const products = [];
const seenIds = new Set();

// Уже собранное не теряем: скрипт можно прервать и запустить снова.
if (existsSync(OUT)) {
  try {
    const prev = JSON.parse(readFileSync(OUT, "utf8"));
    if (prev.kind === "wildberries" && Array.isArray(prev.products)) {
      for (const p of prev.products) {
        if (!seenIds.has(p.id)) { seenIds.add(p.id); products.push(p); }
      }
      console.log(`продолжаем: уже собрано ${products.length}`);
    }
  } catch { /* повреждённый файл просто перезапишем */ }
}

console.log(`цель: ${TARGET} товаров, запросов: ${QUERIES.length}, описания: ${WITH_CARDS ? "да" : "нет"}`);

// Маркетплейс отвечает отказом на запросы из дата-центров. Проверяем это сразу,
// чтобы не выяснять через десять минут пустого прогона.
{
  const probeUrl = searchUrl(QUERIES[0], 1);
  const res = await fetch(probeUrl, {
    headers: { Accept: "application/json", "User-Agent": UA, Referer: REFERER },
  }).catch((e) => ({ ok: false, status: 0, _err: e.message }));

  if (res.status === 429 || res.status === 403) {
    console.error(`\nМаркетплейс ответил ${res.status} — этот адрес он не обслуживает.`);
    console.error("Так бывает на сервере, в облаке или через VPN/прокси.");
    console.error("Запустите скрипт с обычного домашнего или офисного подключения.\n");
    process.exit(1);
  }
  if (!res.ok) {
    console.error(`\nПоиск недоступен: ${res.status || res._err}. Проверьте подключение к сети.\n`);
    process.exit(1);
  }
  console.log("связь с маркетплейсом есть\n");
}

outer:
for (const query of QUERIES) {
  for (let page = 1; page <= MAX_PAGE; page++) {
    if (products.length >= TARGET) break outer;

    const json = await getJson(searchUrl(query, page));
    const items = json?.data?.products ?? json?.products ?? [];
    if (!items.length) break;

    let added = 0;
    for (const it of items) {
      if (products.length >= TARGET) break;
      if (seenIds.has(`wb-${it.id}`)) continue;
      const p = await toProduct(it, query);
      if (p) { seenIds.add(p.id); products.push(p); added++; }
    }
    console.log(`«${query}» стр.${page}: +${added} → всего ${products.length}`);
    save(products);
    await sleep(GAP_MS);
  }
}

save(products);
const kb = Math.round(JSON.stringify(products).length / 1024);
console.log(`\nготово: ${products.length} товаров, ${new Set(products.map((p) => p.category)).size} категорий, ${kb} КБ`);
console.log(`файл: ${OUT}`);
if (products.length < TARGET) {
  console.log(`\nнабралось меньше цели — добавьте запросы через --queries или увеличьте --max-page`);
}

if (PUSH) {
  const { execSync } = await import("node:child_process");
  const run = (cmd) => execSync(cmd, { stdio: "inherit" });
  try {
    console.log("\nвыкладываем базу в репозиторий…");
    run(`git add ${OUT}`);
    run(`git commit -m "Update catalogue: ${products.length} products from Wildberries"`);
    run("git push");
    console.log("готово — деплой подхватит базу автоматически");
  } catch {
    console.log("не удалось запушить автоматически. Сделайте вручную:");
    console.log(`  git add ${OUT} && git commit -m "Update catalogue" && git push`);
  }
}
