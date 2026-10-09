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
  const where = {
    feed: stored?.feed ?? 0,
    cursor: stored?.cursor ?? "",
    feedId: stored?.feedId ?? null,
    categoryId: stored?.categoryId ?? null,
  };
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
  // {"price": {"cents": 11000, "currency": "RUB"}} — так отдаёт фид.
  const cents = num(pick(raw, ...names.map((n) => `${n}.cents`), ...names.map((n) => `${n}Cents`)));
  if (cents !== undefined) return Math.round(cents) / 100;
  const plain = num(pick(raw, ...names, ...names.map((n) => `${n}.value`), ...names.map((n) => `${n}.amount`)));
  return plain;
}

function images(raw) {
  const list = pick(raw, "imageGallery", "images", "imageUrls", "pictures", "productImages", "gallery");
  const many = Array.isArray(list)
    ? list.map((i) => (typeof i === "string" ? i : pick(i ?? {}, "url", "imageUrl", "src"))).filter(Boolean)
    : [];
  const single = pick(raw, "imageURL", "image", "imageUrl", "mainImage", "productImage", "mainImageUrl", "picture");
  const all = many.length ? many : single ? [single] : [];
  // Фид отдаёт адреса без схемы («//ae01.alicdn.com/…») — браузер такое поймёт,
  // а наш загрузчик картинок нет.
  return [...new Set(all.map((u) => String(u).replace(/^\/\//, "https://")))].slice(0, 8);
}

/**
 * Категория товара в фиде не приходит — её заменяет сам фид. Названия у них
 * длинные («Дом, сад и офис. Обустройство дома и инструменты. Бытовая
 * техника»), а в ленте это подпись на кнопке фильтра, поэтому берём первую
 * часть.
 */
function shortCategory(feedTitle) {
  const head = String(feedTitle ?? "").split(/[.;]/)[0].trim();
  if (!head) return undefined;
  return head.length <= 28 ? head : head.split(",")[0].trim().slice(0, 28);
}

/**
 * AE Platform → карточка приложения.
 *
 * Фид отдаёт товар в формате JSON:API: сам товар лежит в attributes, цена —
 * объектом с суммой в копейках, картинки — отдельной галереей. Прежние имена
 * полей оставлены запасными: у разных фидов попадаются и они.
 */
function toProduct(row, feedTitle) {
  const a = row?.attributes ?? row ?? {};
  // Идентификатор берём товарный, а не строковый ключ курсора («0_1005…»):
  // по нему же строится ссылка на карточку AliExpress.
  const id = pick(a, "itemId", "productId", "product_id") ?? String(pick(row ?? {}, "id") ?? "").split("_").pop();
  if (!id) return null;

  const price = money(a, "price", "salePrice", "appSalePrice", "targetSalePrice", "minPrice");
  const was = money(a, "originalPrice", "oldPrice", "priceWithoutDiscount", "listPrice", "maxPrice");
  const rating = num(pick(a, "rating", "evaluateRate", "averageStar", "score"));
  const link = pick(a, "pageURL", "productUrl", "link", "url", "productDetailUrl");
  const storeName = pick(a, "store.title", "store.name", "storeName", "shopName", "seller.name");

  return {
    id: `ae-${id}`,
    title: String(pick(a, "title", "productTitle", "name", "subject") ?? "").slice(0, 200),
    description: String(pick(a, "description", "shortDescription") ?? "").slice(0, 4000),
    url: String(link ?? `https://aliexpress.ru/item/${id}.html`),
    images: images(a),
    price,
    // «Было» показываем только если оно и правда больше текущей цены.
    priceMax: was !== undefined && price !== undefined && was > price ? was : undefined,
    currency: String(pick(a, "price.currency", "currency", "currencyCode") ?? "RUB"),
    category: shortCategory(feedTitle),
    brand: pick(a, "brand", "brandName") ?? undefined,
    // Рейтинг у площадки по пятибалльной шкале; сотенную встречаем на всякий случай.
    rating: rating !== undefined && rating > 5 ? rating / 20 : rating,
    reviewsCount: num(pick(a, "evaluationsCount", "reviewsCount", "feedbackCount")),
    soldCount: num(pick(a, "purchasesAmount", "salesCount", "orders", "volume")),
    minOrder: 1,
    seller: storeName
      ? {
          name: String(storeName),
          // Российский продавец — это быстрая доставка, и человеку это важнее
          // всего остального, что мы знаем о магазине.
          location: pick(a, "isLocal") === true ? "Россия" : undefined,
          url: pick(a, "store.url") ?? undefined,
        }
      : undefined,
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
  const empty = { version: 1, kind: "ae", products: [] };
  try {
    const f = JSON.parse(readFileSync(OUT, "utf8"));
    if (!Array.isArray(f.products)) return empty;

    // На этом месте мог лежать каталог другого источника — скажем, Etsy.
    // Дописывать в него товары AliExpress нельзя: витрина получится смесью,
    // в которой половина карточек ведёт в чужой магазин и не приносит
    // комиссии. Начинаем заново, а чужие карточки отбрасываем.
    const foreign = f.products.filter((p) => p.source !== "ae").length;
    if (foreign) {
      console.log(`В снапшоте ${foreign} карточек не из AliExpress (каталог «${f.kind ?? "без имени"}») — начинаем заново.`);
      console.log(`  Прежний файл сохраняю рядом: ${OUT}.bak`);
      try {
        writeFileSync(`${OUT}.bak`, JSON.stringify(f));
      } catch (e) {
        console.error("  Копию сделать не удалось:", e.message);
      }
      return empty;
    }
    return f;
  } catch {
    // снапшота ещё нет
  }
  return empty;
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
  let total;

  /**
   * Первый запрос идёт без номера страницы — так показано в документации, и
   * так площадка отдаёт начало списка независимо от того, с нуля у неё
   * нумерация или с единицы. Дальше номера перебираем, а повторы схлопываются
   * по идентификатору: ошибиться на единицу дешевле, чем потерять фид.
   */
  for (let step = 0; step <= 20; step++) {
    const query = { limit: FEEDS_PAGE };
    if (step > 0) query.page = step;
    const data = await call("/api/v1/productsfeeds/feeds", { query });
    if (step === 0) lastFeedsResponse = data;

    const rows = feedsOf(data)
      .map((f) => ({
        id: String(pick(f, "id", "feedId", "productFeedId", "attributes.id") ?? ""),
        title: String(pick(f, "title", "name", "attributes.title") ?? "без названия"),
      }))
      .filter((f) => f.id);

    const before = out.size;
    for (const row of rows) out.set(row.id, row);
    total ??= num(pick(data ?? {}, "meta.total", "total"));

    // Хватит, когда собрали всё обещанное или очередная страница не принесла
    // ничего нового.
    if (total !== undefined && out.size >= total) break;
    if (step > 0 && out.size === before) break;
  }

  if (total !== undefined && out.size < total) {
    console.log(`Площадка обещает ${total} фидов, а отдала ${out.size} — работаем с тем, что пришло.`);
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

/**
 * Категории, товары которых есть в фиде. Один запрос на фид — и дальше можно
 * обходить его по категориям, а не целиком: тогда у каждого товара категория
 * своя («Рыбалка», «Автотовары»), а не общая на весь фид («Спорт»).
 */
async function listCategories(feedId) {
  try {
    const data = await call("/api/v1/productsfeeds/categories", { query: { productFeedId: feedId } });
    const rows = data?.data ?? data?.categories ?? [];
    return rows
      .map((c) => ({
        id: String(pick(c, "id", "categoryId", "attributes.id") ?? ""),
        title: String(pick(c, "title", "name", "attributes.title", "attributes.name") ?? ""),
      }))
      .filter((c) => c.id && c.title);
  } catch (e) {
    console.error(`Категории фида ${feedId} не получены: ${e.message}`);
    return [];
  }
}

async function productsPage(feedId, cursor, categoryId) {
  const query = {
    productFeedId: feedId,
    limit: pageSize,
    localityType: LOCALITY,
    categoryId,
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

    // Если номер фида известен, список не спрашиваем вовсе: он может быть
    // недоступен, а проверить сам фид это не мешает.
    const feeds = args.feed ? [{ id: String(args.feed), title: "указан флагом" }] : await listFeeds();
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
      const mapped = toProduct(first, feeds.find((f) => f.id === feedId)?.title);
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

  // Продолжаем с того места, где остановились в прошлый раз: фид, категория
  // и страница внутри неё.
  let feedIndex = feeds.findIndex((f) => f.id === ledger.feedId);
  if (feedIndex < 0) feedIndex = Math.min(ledger.feed ?? 0, feeds.length - 1);
  const resuming = feeds[feedIndex]?.id === ledger.feedId;
  let cursor = resuming ? (ledger.cursor ?? "") : "";

  /**
   * Категории текущего фида. Пустой список означает, что фид обходится
   * целиком — у некоторых фидов («Топ продаж») категорий может не быть.
   */
  let categories = await listCategories(feeds[feedIndex].id);
  let categoryIndex = resuming ? categories.findIndex((c) => c.id === ledger.categoryId) : -1;
  if (categoryIndex < 0) categoryIndex = 0;
  if (categories.length) {
    console.log(`Фид ${feeds[feedIndex].id}: категорий ${categories.length}`);
  }

  /** Переход к следующей категории, а когда они кончились — к следующему фиду. */
  async function advance() {
    cursor = "";
    if (categoryIndex + 1 < categories.length) {
      categoryIndex += 1;
      return true;
    }
    feedIndex = (feedIndex + 1) % feeds.length;
    categoryIndex = 0;
    categories = await listCategories(feeds[feedIndex].id);
    if (categories.length) console.log(`Фид ${feeds[feedIndex].id}: категорий ${categories.length}`);
    return feeds.length > 1;
  }

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
    const category = categories[categoryIndex];
    let page;
    try {
      page = await productsPage(feed.id, cursor, category?.id);
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
      // Категория берётся из обхода: в самом товаре её нет. Без категорий у
      // фида остаётся его собственное название.
      const product = toProduct(raw, category?.title ?? feed.title);
      if (!usable(product)) {
        skipped += 1;
        continue;
      }
      // Известный товар обновляем — цены на AliExpress живут своей жизнью, —
      // но не дублируем. Один и тот же товар попадается в нескольких фидах
      // (скажем, в «Электронике» и в «Топе продаж»), и категория достаётся
      // ему от того обхода, который встретился первым.
      if (!known.has(product.id)) {
        if (known.size >= MAX_PRODUCTS) continue;
        added += 1;
      }
      known.set(product.id, product);
    }
    dry = added > addedBefore ? 0 : dry + 1;
    console.log(
      `  фид ${feed.id}${category ? ` / ${category.title}` : ""}: получено ${page.items.length}, в каталоге ${known.size}`,
    );

    cursor = page.next;
    // Категория кончилась: курсор пуст или страница пришла пустой.
    if (!cursor || !page.items.length) {
      const more = await advance();
      if (!more) {
        console.log("Все фиды и категории пройдены до конца.");
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
    categoryId: categories[categoryIndex]?.id ?? null,
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
