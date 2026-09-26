/**
 * Импорт каталога из Etsy Open API v3.
 *
 * Главное ограничение — дневной лимит запросов. Поэтому приложение в API не
 * ходит вообще: импортёр складывает снапшот на диск, а лента, карточка товара
 * и все свайпы читают только его. Ни один лайк не стоит ни одного запроса.
 *
 * Бюджет расходуется экономно. Etsy отдаёт до 100 товаров за запрос, но
 * картинок в выдаче поиска нет — они приходят отдельным пакетным запросом,
 * тоже по 100 штук. Итого два запроса на сотню карточек: 50 товаров за запрос.
 *
 * Запуск:
 *   ETSY_API_KEY=... node scripts/build-catalog-etsy.mjs --check
 *   ETSY_API_KEY=... node scripts/build-catalog-etsy.mjs --budget 200
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a, i, all) =>
    a.startsWith("--") ? [[a.slice(2), all[i + 1]?.startsWith("--") === false ? all[i + 1] : true]] : [],
  ),
);

const BASE = (process.env.ETSY_BASE || "https://openapi.etsy.com").replace(/\/+$/, "");
/**
 * Etsy требует в x-api-key пару «keystring:shared_secret». Секрет можно задать
 * отдельной переменной — так его удобнее хранить и не приходится склеивать
 * строку руками при каждом запуске.
 */
const SECRET = process.env.ETSY_SHARED_SECRET?.trim();
const RAW_KEY = process.env.ETSY_API_KEY?.trim();
const KEY = RAW_KEY && SECRET && !RAW_KEY.includes(":") ? `${RAW_KEY}:${SECRET}` : RAW_KEY;
const OUT = String(args.out || process.env.CATALOG_FILE || "data/catalog.json");
const LEDGER = join(dirname(OUT), "catalog-budget.json");

/** Сколько запросов разрешено потратить за сутки. Заметно ниже лимита — про запас. */
const DAILY_BUDGET = Number(args.budget ?? process.env.ETSY_DAILY_BUDGET ?? 4000);
const PAGE = 100; // максимум, который принимает Etsy
const CHECK = !!args.check;

/**
 * Запросы разложены по темам: без этого поиск вернёт 5000 однотипных товаров.
 * Каждый прогон начинает с той темы, на которой закончился прошлый.
 *
 * Список тем — это и есть размер каталога: глубже DEPTH позиций по одному
 * слову Etsy не пускает, поэтому потолок равен «темы × DEPTH × сортировки».
 * С двадцатью темами и глубиной 1000 он составлял 20 000 карточек, и каталог
 * упёрся в него, а ночной прогон продолжал тратить бюджет на перебор уже
 * известного.
 */
const TOPICS = [
  "handmade jewelry", "leather bag", "ceramic mug", "wall art print", "knitted sweater",
  "wooden toy", "scented candle", "silver ring", "linen dress", "vintage lamp",
  "phone case", "notebook journal", "embroidery kit", "macrame", "cutting board",
  "earrings", "tote bag", "poster", "pet collar", "home decor",
  "necklace", "bracelet", "brooch", "hair clip", "watch strap",
  "leather wallet", "keychain", "backpack", "laptop sleeve", "belt",
  "wooden bowl", "tea set", "wine glass", "coasters", "cheese board",
  "planter pot", "vase", "wall clock", "picture frame", "mirror",
  "quilt", "baby blanket", "apron", "tea towel", "rug",
  "enamel pin", "sticker pack", "bookmark", "greeting card", "wrapping paper",
  "resin art", "soap bar", "bath bomb", "crochet", "beanie",
  "chess set", "puzzle", "bird feeder", "wind chime", "lantern",
];

/** Глубина обхода по одной теме. Etsy отдаёт не больше нескольких тысяч. */
const DEPTH = Number(args.depth ?? process.env.ETSY_TOPIC_DEPTH ?? 2000);

/**
 * Одно и то же слово с разной сортировкой открывает разные срезы выдачи:
 * «score» — то, что Etsy считает лучшим, «created» — свежие объявления,
 * которых в первой сортировке нет вовсе.
 */
const SORTS = ["score", "created"];

/**
 * Потолок каталога. Упираемся не в запросы — их с избытком, — а в диск:
 * фотографии каждой карточки лежат у нас же. Дойдя до потолка, импортёр
 * перестаёт добирать новое, но продолжает обновлять цены у известного.
 */
const MAX_PRODUCTS = Number(args.max ?? process.env.CATALOG_MAX ?? 60000);

/**
 * Сколько страниц обновлять за ночь, когда каталог уже полон. Обход идёт с
 * того места, где кончился прошлый, поэтому за несколько ночей цены
 * обновляются по всему каталогу, а бюджет не тратится впустую.
 */
const REFRESH_PAGES = Number(args.refresh ?? 300);

/**
 * Сколько страниц подряд без единой новой карточки считать за «темы
 * кончились». Выдача обойдена по кругу, дальше ночь уходила бы на перебор
 * того, что уже лежит в снапшоте. Двести страниц — это двадцать тысяч
 * объявлений, обновивших свои цены, и только потом остановка.
 */
const DRY_PAGES = Number(args.dry ?? 200);

// --------------------------------------------------------------- бюджет
/** Счётчик запросов за сутки. Живёт рядом со снапшотом и переживает перезапуски. */
function readLedger() {
  const today = new Date().toISOString().slice(0, 10);
  let stored = null;
  try {
    stored = JSON.parse(readFileSync(LEDGER, "utf8"));
  } catch {
    // Первого запуска ещё не было или файл повреждён — начинаем с нуля.
  }
  // Счётчик запросов живёт сутки, а место в обходе — нет. Раньше со сменой
  // даты терялось и оно, поэтому каждую ночь импортёр начинал с первой темы и
  // заново перебирал то, что уже лежит в снапшоте.
  const where = { topic: stored?.topic ?? 0, offset: stored?.offset ?? 0, sort: stored?.sort ?? 0 };
  return stored?.day === today ? { ...stored, ...where } : { day: today, used: 0, ...where };
}

function writeLedger(l) {
  mkdirSync(dirname(LEDGER), { recursive: true });
  writeFileSync(LEDGER, JSON.stringify(l, null, 2));
}

// ----------------------------------------------------------------- сеть
let spent = 0;

async function call(path, params) {
  const url = new URL(`${BASE}/v3/application${path}`);
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  spent += 1;
  const res = await fetch(url, { headers: { "x-api-key": KEY }, cache: "no-store" });
  if (res.status === 429) throw new Error("LIMIT");
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    // Отказ по ключу выглядит одинаково при трёх разных причинах, а чинятся они
    // по-разному — поэтому называем их прямо, а не показываем голый код.
    if (res.status === 401) {
      throw new Error(
        `Etsy не принял ключ (401). В x-api-key нужен keystring приложения. ` +
          `Если keystring верный, попробуйте форму «keystring:shared_secret». Ответ: ${body}`,
      );
    }
    if (res.status === 403) {
      // Etsy сам пишет причину, и она бывает разной: то не хватает секрета в
      // ключе, то приложение ещё не одобрено. Ставим его текст первым, а свои
      // домыслы — только там, где они уместны.
      const needsSecret = /shared secret/i.test(body);
      throw new Error(
        `Etsy отказал (403): ${body}` +
          (needsSecret && !KEY.includes(":")
            ? `\n  → в x-api-key нужна пара «keystring:shared_secret». Задайте ETSY_SHARED_SECRET рядом с ETSY_API_KEY.`
            : ""),
      );
    }
    throw new Error(`Etsy ответил ${res.status}: ${body}`);
  }
  return res.json();
}

// ------------------------------------------------------------ разбор
/** Цена у Etsy — целое в минорных единицах: 1234 при divisor 100 это 12,34. */
function money(m) {
  if (!m || typeof m.amount !== "number") return undefined;
  const div = m.divisor && m.divisor > 0 ? m.divisor : 100;
  return Math.round((m.amount / div) * 100) / 100;
}

/** Теги Etsy — свободный текст; в категорию превращаем по первому знакомому слову. */
const CATEGORY_BY_TAG = [
  [/jewel|ring|earring|necklace|bracelet/i, "jewelry"],
  [/bag|tote|backpack|purse|wallet/i, "bags"],
  [/mug|cup|ceramic|plate|bowl|kitchen|cutting board/i, "kitchen"],
  [/art|print|poster|painting|wall/i, "art"],
  [/sweater|dress|shirt|scarf|hat|clothing|apparel/i, "clothing"],
  [/toy|kids|baby|child/i, "toys"],
  [/candle|decor|lamp|pillow|home/i, "home"],
  [/phone|case|tech|laptop/i, "electronics"],
  [/pet|dog|cat/i, "pets"],
  [/notebook|journal|paper|sticker|stationery/i, "stationery"],
];

function categoryOf(listing) {
  const haystack = [...(listing.tags ?? []), ...(listing.materials ?? []), listing.title ?? ""].join(" ");
  for (const [re, cat] of CATEGORY_BY_TAG) if (re.test(haystack)) return cat;
  return "misc";
}

/** Etsy → карточка приложения. Источник помечаем catalog: тогда приложение не
 *  станет дотягивать описание по сети при открытии товара. */
function toProduct(listing, images) {
  const price = money(listing.price);
  // Берём вариант на 570 точек, а не полноразмерный: карточка на телефоне —
  // около 350 точек шириной, а url_fullxfull у Etsy бывает 2000–3000 и весит
  // сотни килобайт. На мобильной сети это разница между «мгновенно» и
  // «подождите».
  const pics = (images ?? [])
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
    .map((i) => i.url_570xN || i.url_fullxfull || i.url_170x135)
    .filter(Boolean)
    .slice(0, 8);

  return {
    id: `etsy-${listing.listing_id}`,
    title: String(listing.title ?? "").slice(0, 200),
    description: String(listing.description ?? "").slice(0, 4000),
    url: listing.url ?? `https://www.etsy.com/listing/${listing.listing_id}`,
    images: pics,
    price,
    priceMax: undefined,
    currency: listing.price?.currency_code ?? "USD",
    category: categoryOf(listing),
    brand: listing.shop?.shop_name ?? undefined,
    rating: undefined,
    reviewsCount: typeof listing.num_favorers === "number" ? listing.num_favorers : undefined,
    soldCount: undefined,
    minOrder: 1,
    seller: listing.shop ? { name: listing.shop.shop_name, location: listing.shop.shop_location ?? undefined } : undefined,
    attributes: [
      ...(listing.who_made ? [{ name: "Изготовитель", value: String(listing.who_made) }] : []),
      ...(listing.when_made ? [{ name: "Когда сделано", value: String(listing.when_made) }] : []),
      ...(listing.materials?.length ? [{ name: "Материалы", value: listing.materials.slice(0, 6).join(", ") }] : []),
    ],
    reviews: [],
    skus: [],
    tiers: [],
    source: "catalog",
  };
}

/** Карточка без картинки в свайп-ленте бесполезна. */
const usable = (p) => p.images.length > 0 && p.title && p.price !== undefined;

// ------------------------------------------------------------- снапшот
function readSnapshot() {
  try {
    const f = JSON.parse(readFileSync(OUT, "utf8"));
    if (Array.isArray(f.products)) return f;
  } catch {
    // Снапшота нет — соберём первый.
  }
  return { version: 1, kind: "etsy", products: [] };
}

/** Пишем через временный файл: приложение читает снапшот на лету и не должно
 *  наткнуться на половину. */
function writeSnapshot(file) {
  mkdirSync(dirname(OUT), { recursive: true });
  const tmp = `${OUT}.tmp`;
  writeFileSync(tmp, JSON.stringify(file));
  renameSync(tmp, OUT);
}

// ---------------------------------------------------------------- ход
async function main() {
  if (!KEY) {
    console.error("Нужен ETSY_API_KEY (keystring) и ETSY_SHARED_SECRET. Оба берутся в кабинете разработчика Etsy.");
    process.exitCode = 1;
    return;
  }
  // В заголовок HTTP можно положить только ASCII. Без этой проверки опечатка с
  // кириллицей или лишними кавычками роняет скрипт невнятной ошибкой из fetch.
  if (!/^[\x21-\x7e]+$/.test(KEY)) {
    console.error("ETSY_API_KEY содержит недопустимые символы. Ожидается строка без пробелов и кавычек, только латиница и цифры.");
    process.exitCode = 1;
    return;
  }

  const ledger = readLedger();
  const left = Math.max(0, DAILY_BUDGET - ledger.used);
  console.log(`Бюджет на сегодня: ${DAILY_BUDGET}, потрачено ${ledger.used}, осталось ${left}`);

  if (CHECK) {
    const data = await call("/listings/active", { limit: 3, keywords: "handmade" });
    console.log(`Ответ получен: всего ${data.count}, в выборке ${data.results?.length ?? 0}`);
    const first = data.results?.[0];
    if (first) {
      console.log("  первый товар:", first.title?.slice(0, 60));
      console.log("  цена:", money(first.price), first.price?.currency_code);
      console.log("  полей в товаре:", Object.keys(first).length);
    }
    ledger.used += spent;
    writeLedger(ledger);
    console.log(`Потрачено запросов: ${spent}`);
    return;
  }

  if (left < 2) {
    console.log("Бюджет на сегодня исчерпан, выходим. Импортёр доберёт остальное завтра.");
    return;
  }

  const snapshot = readSnapshot();
  const known = new Map(snapshot.products.map((p) => [p.id, p]));
  const before = known.size;
  let added = 0;
  let topic = ledger.topic ?? 0;
  let offset = ledger.offset ?? 0;
  let sort = ledger.sort ?? 0;
  let pages = 0;
  let skipped = 0;
  let dry = 0;

  // Пара «поиск + картинки» стоит два запроса, поэтому цикл идёт, пока их хватает.
  while (spent + 2 <= left) {
    // Каталог полон: добирать нечего, остаётся обновить цены — и не всю ночь.
    if (known.size >= MAX_PRODUCTS && pages >= REFRESH_PAGES) {
      console.log(`Каталог добрал до потолка (${MAX_PRODUCTS}); обновили ${pages} страниц и останавливаемся.`);
      break;
    }
    if (dry >= DRY_PAGES) {
      console.log(`${dry} страниц подряд без новых карточек — выдача обойдена, остальной бюджет не тратим.`);
      break;
    }
    const keywords = TOPICS[topic % TOPICS.length];
    let found;
    try {
      found = await call("/listings/active", { limit: PAGE, offset, keywords, sort_on: SORTS[sort % SORTS.length] });
    } catch (e) {
      if (e.message === "LIMIT") {
        console.log("Etsy ответил 429 — останавливаемся, продолжим в следующий раз.");
        break;
      }
      throw e;
    }

    const results = found.results ?? [];
    if (!results.length) {
      // Тема исчерпана — переходим к следующей с начала.
      topic += 1;
      offset = 0;
      continue;
    }

    // Картинки берём пакетом: сотня товаров за один запрос вместо сотни запросов.
    const ids = results.map((r) => r.listing_id).filter(Boolean);
    let withImages = [];
    try {
      const batch = await call("/listings/batch", { listing_ids: ids.join(","), includes: "Images,Shop" });
      withImages = batch.results ?? [];
    } catch (e) {
      if (e.message === "LIMIT") break;
      throw e;
    }

    const byId = new Map(withImages.map((l) => [l.listing_id, l]));
    const addedBefore = added;
    for (const listing of results) {
      // Пакетный ответ берём только ради картинок и магазина: основа — выдача
      // поиска. Иначе любое расхождение в полях между ручками молча затирало бы
      // название, цену и теги, по которым определяется категория.
      const extra = byId.get(listing.listing_id);
      const product = toProduct({ ...listing, shop: extra?.shop }, extra?.images);
      if (!usable(product)) continue;
      const fresh = !known.has(product.id);
      // Дойдя до потолка, новое не берём, а известное продолжаем обновлять:
      // цены у Etsy меняются, и ради них обход и продолжается.
      if (fresh && known.size >= MAX_PRODUCTS) {
        skipped += 1;
        continue;
      }
      if (fresh) added += 1;
      known.set(product.id, product);
    }

    pages += 1;
    dry = added > addedBefore ? 0 : dry + 1;
    offset += PAGE;
    if (offset >= DEPTH) {
      topic += 1;
      offset = 0;
      // Темы кончились — идём по второму кругу с другой сортировкой, она
      // открывает ту часть выдачи, которой в первой не было.
      if (topic % TOPICS.length === 0) sort += 1;
    }
    console.log(`  «${keywords}»: получено ${results.length}, в каталоге ${known.size}`);
  }

  const products = [...known.values()];
  writeSnapshot({
    version: 1,
    kind: "etsy",
    generatedAt: new Date().toISOString(),
    categories: [...new Set(products.map((p) => p.category).filter(Boolean))],
    products,
  });

  writeLedger({ day: ledger.day, used: ledger.used + spent, topic, offset, sort });
  console.log(
    `Готово: было ${before}, стало ${products.length} (+${added}). ` +
      (skipped ? `Мимо потолка ${MAX_PRODUCTS} прошло ${skipped} карточек. ` : "") +
      `Потрачено запросов: ${spent}, всего за сутки ${ledger.used + spent} из ${DAILY_BUDGET}. ` +
      `Обход остановился на теме «${TOPICS[topic % TOPICS.length]}», смещение ${offset}.`,
  );
  console.log(`Снапшот: ${OUT}`);
}

main().catch((e) => {
  console.error("Импорт не удался:", e.message || e);
  process.exitCode = 1;
});
