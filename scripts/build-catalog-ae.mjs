#!/usr/bin/env node
/**
 * Импорт каталога AliExpress через продуктовые фиды AE Platform.
 *
 * Подход тот же, что был у Etsy, и по той же причине: у платформы есть лимиты,
 * а приложение не должно тратить их на каждый свайп. Импортёр складывает
 * снапшот на диск, а лента, карточка товара и все свайпы читают только его —
 * ни один свайп не стоит ни одного запроса к API.
 *
 * Обход идёт курсором (fromLastId), и место в обходе переживает смену суток:
 * счётчик запросов живёт днями, а позиция — нет, иначе каждую ночь импортёр
 * начинал бы с первой страницы и заново перебирал уже известное.
 *
 *   node scripts/build-catalog-ae.mjs --check
 *   node scripts/build-catalog-ae.mjs --dump raw.json
 *   node scripts/build-catalog-ae.mjs --file /var/lib/swiper/catalog.json
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { call, env, pause, spent, token, AeError } from "./ae-api.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a, i, all) =>
    a.startsWith("--") ? [[a.slice(2), all[i + 1]?.startsWith("--") === false ? all[i + 1] : true]] : [],
  ),
);

const OUT = String(args.file || args.out || env.CATALOG_FILE || "data/catalog.json");
const LEDGER = join(dirname(OUT), "ae-budget.json");
const CHECK = !!args.check;
const DUMP = typeof args.dump === "string" ? args.dump : null;

/** Сколько запросов разрешено потратить за сутки. Числовых лимитов платформа
 *  не публикует, поэтому берём заведомо скромную величину. */
const DAILY_BUDGET = Number(args.budget ?? env.AE_DAILY_BUDGET ?? 2000);
/** Максимум, который принимает метод товаров фида. */
const PAGE = 100;
/** Потолок каталога: упираемся не в запросы, а в диск под фотографии. */
const MAX_PRODUCTS = Number(args.max ?? env.CATALOG_MAX ?? 60000);
/** Сколько страниц подряд без новых карточек считать за «фид кончился». */
const DRY_PAGES = Number(args.dry ?? 50);
/** Пауза между запросами: спешить некуда, а 429 стоит дорого. */
const DELAY = Number(args.delay ?? 250);
/** Только российские продавцы, только зарубежные или все подряд. */
const LOCALITY = String(args.locality || env.AE_LOCALITY || "all");

// --------------------------------------------------------------- журнал
function today() {
  return new Date().toISOString().slice(0, 10);
}

function readLedger() {
  let stored = null;
  try {
    stored = JSON.parse(readFileSync(LEDGER, "utf8"));
  } catch {
    // первого запуска ещё не было
  }
  // Счётчик запросов живёт сутками, место в обходе — нет.
  const where = { feed: stored?.feed ?? 0, cursor: stored?.cursor ?? "", feedId: stored?.feedId ?? null };
  return stored?.day === today() ? { ...stored, ...where } : { day: today(), used: 0, ...where };
}

function writeLedger(l) {
  mkdirSync(dirname(LEDGER), { recursive: true });
  writeFileSync(LEDGER, JSON.stringify(l, null, 2));
}

// ------------------------------------------------------------- разбор
/**
 * Полезная нагрузка JWT. Подпись не проверяем — токен выдала нам сама
 * площадка минуту назад, и читаем мы его только чтобы показать человеку,
 * какой у него user_id.
 */
function readClaims(jwt) {
  try {
    const part = String(jwt).split(".")[1];
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

/** Достаём значение по первому подошедшему имени; «store.name» — тоже имя. */
function pick(obj, ...names) {
  for (const name of names) {
    let value = obj;
    for (const part of name.split(".")) value = value?.[part];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function num(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") {
    const n = Number(value.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/**
 * Цены в фиде приходят в копейках (поля с суффиксом Cents) — приводим к рублям.
 * Имена полей в документации не расписаны, поэтому принимаем несколько
 * вариантов: ошибиться с ценой хуже, чем перечислить лишнее имя.
 */
function money(raw, ...names) {
  const cents = num(pick(raw, ...names.map((n) => `${n}Cents`)));
  if (cents !== undefined) return Math.round(cents) / 100;
  const plain = num(pick(raw, ...names, ...names.map((n) => `${n}.value`), ...names.map((n) => `${n}.amount`)));
  return plain;
}

function images(raw) {
  const list = pick(raw, "images", "imageUrls", "pictures", "productImages", "gallery");
  const many = Array.isArray(list)
    ? list.map((i) => (typeof i === "string" ? i : pick(i ?? {}, "url", "imageUrl", "src"))).filter(Boolean)
    : [];
  const single = pick(raw, "image", "imageUrl", "mainImage", "productImage", "mainImageUrl", "picture");
  const all = many.length ? many : single ? [single] : [];
  // Фид отдаёт адреса без схемы («//ae01.alicdn.com/…») — браузер такое поймёт,
  // а наш загрузчик картинок нет.
  return [...new Set(all.map((u) => String(u).replace(/^\/\//, "https://")))].slice(0, 8);
}

/** AE Platform → карточка приложения. */
function toProduct(raw, categories) {
  const id = pick(raw, "productId", "product_id", "itemId", "id");
  if (!id) return null;
  const price = money(raw, "salePrice", "price", "appSalePrice", "targetSalePrice", "minPrice");
  const was = money(raw, "originalPrice", "oldPrice", "listPrice", "maxPrice");
  const categoryId = pick(raw, "categoryId", "category_id", "firstLevelCategoryId");
  const link = pick(raw, "productUrl", "link", "url", "productDetailUrl", "targetLink");
  const rating = num(pick(raw, "rating", "evaluateRate", "averageStar", "score"));

  return {
    id: `ae-${id}`,
    title: String(pick(raw, "title", "productTitle", "name", "subject") ?? "").slice(0, 200),
    description: String(pick(raw, "description", "shortDescription") ?? "").slice(0, 4000),
    url: String(link ?? `https://aliexpress.ru/item/${id}.html`),
    images: images(raw),
    price,
    // «Было» показываем только если оно и правда больше текущей цены.
    priceMax: was !== undefined && price !== undefined && was > price ? was : undefined,
    currency: String(pick(raw, "currency", "currencyCode") ?? "RUB"),
    category: categories.get(String(categoryId)) ?? (categoryId ? `cat-${categoryId}` : undefined),
    brand: pick(raw, "brand", "brandName") ?? undefined,
    rating: rating !== undefined && rating <= 5 ? rating : rating !== undefined ? rating / 20 : undefined,
    reviewsCount: num(pick(raw, "evaluationsCount", "reviewsCount", "feedbackCount")),
    soldCount: num(pick(raw, "purchasesAmount", "salesCount", "orders", "volume")),
    minOrder: 1,
    seller: (() => {
      const name = pick(raw, "store.name", "storeName", "shopName", "store.title", "seller.name");
      if (!name) return undefined;
      const locality = pick(raw, "localityType", "sellerType", "store.localityType");
      return {
        name: String(name),
        location: locality === "onlyLocal" || locality === "ru_site" ? "Россия" : undefined,
      };
    })(),
    attributes: [],
    reviews: [],
    skus: [],
    tiers: price !== undefined ? [{ from: 1, price }] : [],
    source: "ae",
  };
}

/** Карточка без картинки или цены в свайп-ленте бесполезна. */
const usable = (p) => p && p.images.length > 0 && p.title && p.price !== undefined;

// ------------------------------------------------------------- снапшот
function readSnapshot() {
  try {
    const f = JSON.parse(readFileSync(OUT, "utf8"));
    if (Array.isArray(f.products)) return f;
  } catch {
    // снапшота ещё нет
  }
  return { version: 1, kind: "ae", products: [] };
}

function writeSnapshot(file) {
  mkdirSync(dirname(OUT), { recursive: true });
  const tmp = `${OUT}.tmp`;
  writeFileSync(tmp, JSON.stringify(file));
  renameSync(tmp, OUT);
}

// ----------------------------------------------------------------- API
const feedsOf = (data) => data?.data ?? data?.feeds ?? [];

/** Предел на размер страницы у этого метода — 30, в отличие от товаров фида. */
const FEEDS_PAGE = 30;

/** Последний ответ со списком фидов: пригодится, если список окажется пустым. */
let lastFeedsResponse = null;

async function listFeeds() {
  const out = new Map();
  for (let page = 1; page <= 20; page++) {
    const data = await call("/api/v1/productsfeeds/feeds", { query: { limit: FEEDS_PAGE, page } });
    if (page === 1) lastFeedsResponse = data;
    const rows = feedsOf(data)
      .map((f) => ({
        id: String(pick(f, "id", "feedId", "productFeedId", "attributes.id") ?? ""),
        title: String(pick(f, "title", "name", "attributes.title") ?? "без названия"),
      }))
      .filter((f) => f.id);
    for (const row of rows) out.set(row.id, row);

    const total = num(pick(data ?? {}, "meta.total", "total"));
    // Хватит, когда страница пришла неполной или собрали всё, что обещано.
    if (rows.length < FEEDS_PAGE || (total !== undefined && out.size >= total)) break;
  }
  return [...out.values()];
}

/**
 * Активные площадки партнёра. Их идентификатор нужен для создания
 * партнёрских ссылок, а в кабинете он показан не везде — API называет его
 * сам, и это самый надёжный способ его узнать.
 */
async function listPlacements(userId) {
  const data = await call(`/api/v1/users/${userId}/placements/active`);
  return (data?.placements ?? data?.data ?? []).map((p) => ({
    id: String(pick(p, "id", "placementId", "attributes.id") ?? ""),
    title: String(
      pick(p, "title", "name", "url", "siteUrl", "domain", "link", "attributes.title", "attributes.url") ??
        "без названия",
    ),
  }));
}

/** Справочник категорий фида: один запрос на фид, зато карточки с названиями. */
async function listCategories(feedId) {
  const out = new Map();
  try {
    const data = await call("/api/v1/productsfeeds/categories", { query: { productFeedId: feedId } });
    for (const c of data?.data ?? data?.categories ?? []) {
      const id = pick(c, "id", "categoryId", "attributes.id");
      const title = pick(c, "title", "name", "attributes.title", "attributes.name");
      if (id && title) out.set(String(id), String(title));
    }
  } catch (e) {
    console.error("Категории фида не получены:", e.message);
  }
  return out;
}

/**
 * Предел размера страницы площадка может поменять, и узнаём мы об этом из
 * отказа 422 с подсказкой в теле. Запоминаем и дальше просим столько, сколько
 * разрешено: ронять многочасовой импорт из-за одного числа незачем.
 */
let pageSize = PAGE;

function smallerLimit(error) {
  const max = /меньше или равно\s*(\d+)/i.exec(error.body ?? "")?.[1];
  return max ? Number(max) : null;
}

async function productsPage(feedId, cursor) {
  const query = {
    productFeedId: feedId,
    limit: pageSize,
    localityType: LOCALITY,
    // Пустое значение курсора означает «с начала» — так написано в документации.
    fromLastId: cursor ?? "",
  };
  let data;
  try {
    data = await call("/api/v1/productsfeeds/products", { query });
  } catch (e) {
    const max = e instanceof AeError && e.status === 422 ? smallerLimit(e) : null;
    if (!max) throw e;
    console.log(`Площадка разрешает не больше ${max} товаров за запрос — дальше просим столько.`);
    pageSize = max;
    data = await call("/api/v1/productsfeeds/products", { query: { ...query, limit: pageSize } });
  }
  return {
    items: data?.data ?? data?.products ?? [],
    next: String(pick(data ?? {}, "meta.nextFromLastId", "nextFromLastId") ?? ""),
    total: num(pick(data ?? {}, "meta.total", "total")),
  };
}

// ----------------------------------------------------------------- ход
/** Журнал нужен и обработчику ошибок: потраченные запросы должны быть учтены
 *  даже тогда, когда прогон оборвался. */
let ledger = null;

async function main() {
  ledger = readLedger();
  const left = Math.max(0, DAILY_BUDGET - ledger.used);
  console.log(`Бюджет на сегодня: ${DAILY_BUDGET}, потрачено ${ledger.used}, осталось ${left}`);

  if (CHECK) {
    const auth = await token();
    console.log("Токен получен. Права:", auth.scope || "(платформа не назвала)");

    // Идентификатор партнёра зашит в сам токен — значит, его не нужно искать
    // в кабинете и легко сверить с тем, что записано в настройках.
    const claims = readClaims(auth.token);
    if (claims?.user_id) {
      const configured = env.AE_USER_ID;
      console.log(
        `Ваш user_id по токену: ${claims.user_id}` +
          (configured && String(configured) !== String(claims.user_id)
            ? ` — а в настройках записан ${configured}. Это расхождение, поправьте AE_USER_ID.`
            : ""),
      );
    }

    const userId = String(claims?.user_id ?? env.AE_USER_ID ?? "");
    if (userId) {
      try {
        const placements = await listPlacements(userId);
        if (placements.length) {
          console.log("Площадки (их id годится для AE_PLACEMENT_ID):");
          for (const p of placements) console.log(`  ${p.id} — ${p.title}`);
        } else {
          console.log("Активных площадок нет. Партнёрские ссылки без площадки не создаются:");
          console.log("  заведите её в кабинете (Инструменты → Площадки) и дождитесь активации.");
        }
      } catch (e) {
        console.log(`Список площадок не получен: ${e.message}`);
        console.log("  Каталогу это не мешает — площадка нужна только для партнёрских ссылок.");
      }
    }

    const feeds = await listFeeds();
    console.log(`Фидов доступно: ${feeds.length}`);
    for (const f of feeds.slice(0, 10)) console.log(`  ${f.id} — ${f.title}`);
    if (!feeds.length) {
      // Пустой список и неузнанный формат ответа выглядят одинаково, поэтому
      // показываем, что именно прислала площадка.
      console.log("Ни одного фида. Вот что ответила площадка:");
      console.log(JSON.stringify(lastFeedsResponse, null, 2).slice(0, 1200));
      console.log("");
      console.log("Если в ответе пусто — фидов у партнёра действительно нет:");
      console.log("  заведите продуктовый фид в кабинете AE Platform и дождитесь его сборки.");
      console.log("Если товары в ответе видны, а список пуст — значит, формат другой:");
      console.log("  пришлите этот вывод, поправлю разбор. Известный фид можно обойти флагом --feed <id>.");
      return;
    }
    const feedId = String(args.feed || feeds[0].id);
    const page = await productsPage(feedId, "");
    console.log(`Страница фида ${feedId}: товаров ${page.items.length}, всего в фиде ${page.total ?? "?"}`);
    const first = page.items[0];
    if (first) {
      console.log("Поля первого товара:", Object.keys(first).join(", "));
      console.log(JSON.stringify(first, null, 2).slice(0, 2000));
      const mapped = toProduct(first, await listCategories(feedId));
      console.log("Как это ляжет в карточку:", JSON.stringify(mapped, null, 2).slice(0, 1200));
      console.log(usable(mapped) ? "✓ карточка пригодна для ленты" : "✗ не хватает картинки, названия или цены");
    }
    console.log(`Потрачено запросов: ${spent.calls}`);
    writeLedger({ ...ledger, used: ledger.used + spent.calls });
    return;
  }

  if (left < 2) {
    console.log("Бюджет на сегодня исчерпан, выходим. Импортёр доберёт остальное завтра.");
    return;
  }

  const feeds = args.feed ? [{ id: String(args.feed), title: "указан флагом" }] : await listFeeds();
  if (!feeds.length) {
    console.error("Нет ни одного фида — проверьте права клиента на продуктовые фиды.");
    process.exitCode = 1;
    return;
  }

  const snapshot = readSnapshot();
  const known = new Map(snapshot.products.map((p) => [p.id, p]));
  const before = known.size;
  let added = 0;
  let skipped = 0;
  let dry = 0;
  const dumped = [];

  // Продолжаем с того фида и места, где остановились в прошлый раз.
  let feedIndex = feeds.findIndex((f) => f.id === ledger.feedId);
  if (feedIndex < 0) feedIndex = Math.min(ledger.feed ?? 0, feeds.length - 1);
  let cursor = feeds[feedIndex]?.id === ledger.feedId ? ledger.cursor : "";
  let categories = await listCategories(feeds[feedIndex].id);

  while (spent.calls + 1 <= left) {
    if (known.size >= MAX_PRODUCTS) {
      console.log(`Каталог добрал до потолка (${MAX_PRODUCTS}) — останавливаемся.`);
      break;
    }
    if (dry >= DRY_PAGES) {
      console.log(`Страниц подряд без новых карточек: ${dry} — фиды обойдены, остаток бюджета не тратим.`);
      break;
    }

    const feed = feeds[feedIndex];
    let page;
    try {
      page = await productsPage(feed.id, cursor);
    } catch (e) {
      if (e instanceof AeError && e.status === 429) {
        console.log("Платформа просит притормозить — на сегодня заканчиваем.");
        break;
      }
      throw e;
    }

    const addedBefore = added;
    for (const raw of page.items) {
      if (dumped.length < 20 && DUMP) dumped.push(raw);
      const product = toProduct(raw, categories);
      if (!usable(product)) {
        skipped += 1;
        continue;
      }
      // Известный товар обновляем — цены на AliExpress живут своей жизнью, —
      // но не дублируем.
      if (!known.has(product.id)) {
        if (known.size >= MAX_PRODUCTS) continue;
        added += 1;
      }
      known.set(product.id, product);
    }
    dry = added > addedBefore ? 0 : dry + 1;
    console.log(`  фид ${feed.id}: получено ${page.items.length}, в каталоге ${known.size}`);

    cursor = page.next;
    // Фид кончился: курсор пуст или перестал двигаться — переходим к следующему.
    if (!cursor || !page.items.length) {
      feedIndex = (feedIndex + 1) % feeds.length;
      cursor = "";
      categories = await listCategories(feeds[feedIndex].id);
      if (feeds.length === 1) {
        console.log("Единственный фид пройден до конца.");
        break;
      }
    }
    await pause(DELAY);
  }

  const products = [...known.values()];
  writeSnapshot({
    version: 1,
    kind: "ae",
    generatedAt: new Date().toISOString(),
    categories: [...new Set(products.map((p) => p.category).filter(Boolean))],
    products,
  });
  writeLedger({
    day: ledger.day,
    used: ledger.used + spent.calls,
    feed: feedIndex,
    feedId: feeds[feedIndex]?.id ?? null,
    cursor,
  });

  if (DUMP && dumped.length) {
    writeFileSync(DUMP, JSON.stringify(dumped, null, 2));
    console.log(`Сырые ответы (${dumped.length} шт.) записаны в ${DUMP}`);
  }

  console.log(
    `Готово: было ${before}, стало ${products.length} (+${added}). ` +
      (skipped ? `Без картинки или цены пропущено ${skipped}. ` : "") +
      `Потрачено запросов: ${spent.calls}, за сутки ${ledger.used + spent.calls} из ${DAILY_BUDGET}.`,
  );
  console.log(`Снапшот: ${OUT}`);
}

main().catch((e) => {
  // Что успели потратить — записываем: иначе после сбоя счётчик за сутки
  // окажется заниженным, и следующий запуск уйдёт за пределы бюджета.
  if (ledger) writeLedger({ ...ledger, used: ledger.used + spent.calls });

  if (e instanceof AeError && e.status === 429) {
    // Это не поломка, а просьба площадки подождать: выходим спокойно, чтобы
    // ночной запуск по расписанию не выглядел упавшим.
    console.log("Платформа просит притормозить — на сегодня заканчиваем.");
    if (e.body) console.log("Ответ платформы:", e.body);
    return;
  }
  console.error("Импорт не удался:", e.message || e);
  if (e instanceof AeError && e.body) console.error("Ответ платформы:", e.body);
  process.exitCode = 1;
});
