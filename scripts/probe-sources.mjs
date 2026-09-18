#!/usr/bin/env node
/**
 * Разведка источников товаров.
 *
 * Какие маркетплейсы отвечают, зависит от страны, из которой идёт запрос:
 * российские закрывают зарубежные адреса, турецкие и глобальные — нет.
 * Проверить это можно только с машины, где будет запускаться импортёр,
 * поэтому скрипт печатает и код ответа, и кусочек тела — по нему видно
 * структуру данных и можно написать точный разбор.
 *
 *   node scripts/probe-sources.mjs              # проверить всех
 *   node scripts/probe-sources.mjs --full       # показать больше тела ответа
 *   node scripts/probe-sources.mjs --only=trendyol
 */
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const SAMPLE = args.full ? 1200 : 420;
const ONLY = args.only ? String(args.only).toLowerCase() : null;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const BROWSER = {
  accept: "application/json, text/plain, */*",
  "accept-language": "ru-RU,ru;q=0.9,tr;q=0.8,en;q=0.7",
  "sec-ch-ua": '"Chromium";v="126", "Google Chrome";v="126", "Not-A.Brand";v="99"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-site",
  "user-agent": UA,
};

const q = encodeURIComponent("кроссовки");
const qTr = encodeURIComponent("spor ayakkabı");

const SOURCES = [
  { id: "dummyjson", title: "DummyJSON (глобальный, без ключа)",
    url: "https://dummyjson.com/products?limit=2" },

  { id: "platzi", title: "Platzi Fake Store (глобальный)",
    url: "https://api.escuelajs.co/api/v1/products?offset=0&limit=2" },

  { id: "fakestore", title: "FakeStore API (глобальный)",
    url: "https://fakestoreapi.com/products?limit=2" },

  { id: "openfoodfacts", title: "Open Food Facts (глобальный, есть русские названия)",
    url: "https://world.openfoodfacts.org/api/v2/search?countries_tags_en=russia&fields=code,product_name,product_name_ru,brands,image_url,quantity&page_size=2" },

  { id: "trendyol", title: "Trendyol (Турция) — поиск",
    url: `https://apigw.trendyol.com/discovery-web-searchgw-service/v2/api/infinite-scroll/sr?q=${qTr}&qt=${qTr}&st=${qTr}&os=1&pi=1&culture=tr-TR&pId=0&scoringAlgorithmId=2&isLegalRequirementConfirmed=false&searchStrategyType=DEFAULT`,
    headers: { origin: "https://www.trendyol.com", referer: "https://www.trendyol.com/" } },

  { id: "trendyol2", title: "Trendyol (Турция) — запасной адрес",
    url: `https://public.trendyol.com/discovery-web-searchgw-service/v2/api/infinite-scroll/sr?q=${qTr}&pi=1&culture=tr-TR`,
    headers: { origin: "https://www.trendyol.com", referer: "https://www.trendyol.com/" } },

  { id: "hepsiburada", title: "Hepsiburada (Турция)",
    url: `https://www.hepsiburada.com/api/search/list?q=${qTr}&page=1`,
    headers: { origin: "https://www.hepsiburada.com", referer: "https://www.hepsiburada.com/" } },

  { id: "wildberries", title: "Wildberries (Россия) — перепроверка",
    url: `https://search.wb.ru/exactmatch/ru/common/v13/search?appType=1&curr=rub&dest=-1257786&lang=ru&page=1&query=${q}&resultset=catalog&sort=popular&spp=30`,
    headers: { origin: "https://www.wildberries.ru", referer: "https://www.wildberries.ru/" } },

  { id: "ozon", title: "Ozon (Россия) — перепроверка",
    url: `https://www.ozon.ru/api/composer-api.bx/page/json/v2?url=/search/?text=${q}`,
    headers: { referer: "https://www.ozon.ru/" } },

  { id: "joom", title: "Joom (глобальный, есть русский)",
    url: `https://api.joom.com/1.1/search/product?query=${q}&count=2`,
    headers: { referer: "https://www.joom.com/" } },
];

function clip(text, n) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > n ? flat.slice(0, n) + "…" : flat;
}

async function probe(src) {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(src.url, {
      headers: { ...BROWSER, ...(src.headers || {}) },
      signal: ctrl.signal,
      redirect: "follow",
    });
    const text = await res.text();
    return { status: res.status, ms: Date.now() - started, type: res.headers.get("content-type") || "", body: text };
  } catch (e) {
    return { status: 0, ms: Date.now() - started, type: "", body: "", error: e.message };
  } finally {
    clearTimeout(timer);
  }
}

const list = ONLY ? SOURCES.filter((s) => s.id.includes(ONLY)) : SOURCES;
console.log(`проверяем ${list.length} источников\n${"─".repeat(60)}`);

const summary = [];
for (const src of list) {
  const r = await probe(src);
  const good = r.status === 200 && /json/i.test(r.type) && r.body.length > 80;
  summary.push({ id: src.id, status: r.status || r.error, good });

  console.log(`\n[${good ? "РАБОТАЕТ" : "нет"}] ${src.title}`);
  console.log(`  ${src.id} · ${r.status || r.error} · ${r.ms} мс · ${r.type.split(";")[0] || "—"} · ${r.body.length} байт`);
  if (r.body) console.log(`  ${clip(r.body, SAMPLE)}`);
}

console.log(`\n${"─".repeat(60)}`);
const ok = summary.filter((s) => s.good);
console.log(ok.length ? `отвечают: ${ok.map((s) => s.id).join(", ")}` : "не ответил никто");
console.log("\nПришлите этот вывод целиком — по нему напишу разбор полей.");
