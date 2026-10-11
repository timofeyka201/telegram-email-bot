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
import { shortCategory } from "./ae-category.mjs";

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
/** Пауза между запросами: спешить некуда, а 429 стоит дорого. */
const DELAY = Number(args.delay ?? 250);
/** Только российские продавцы, только зарубежные или все подряд. */
const LOCALITY = String(args.locality || env.AE_LOCALITY || "all");
/**
 * Какую долю каталога разрешено занять одной категории.
 *
 * Обход шёл вглубь: категория выкачивалась до последней страницы, и только
 * потом начиналась следующая. При потолке в сто тысяч это значит, что первые
 * две-три категории съедали весь каталог, а до остальных дело не доходило
 * никогда — витрина выглядела узкой при формально большом числе карточек.
 */
const QUOTA_SHARE = Number(args.quota ?? env.CATALOG_CATEGORY_SHARE ?? 0.06);
/** Сколько страниц брать у категории за один заход по кругу. */
const LAP_PAGES = Number(args.lap ?? 2);
/** Склейка одинаковых товаров у разных продавцов. */
const DEDUP = String(args.dedup ?? env.CATALOG_DEDUP ?? "1") !== "0";

/**
 * Какие фиды брать. Без флага — все, что отдала площадка; с флагом
 * «--feed 104,99» — только перечисленные и в этом же порядке: так каталог
 * начинают наполнять те разделы, которые нужны в первую очередь.
 */
function chosenFeeds(all) {
  if (!args.feed || args.feed === true) return all;
  const wanted = String(args.feed)
    .split(/[,\s]+/)
    .map((v) => v.trim())
    .filter(Boolean);
  const byId = new Map(all.map((f) => [f.id, f]));
  const picked = wanted.map((id) => byId.get(id) ?? { id, title: "указан флагом" });
  const missing = wanted.filter((id) => !byId.has(id));
  if (missing.length && all.length) {
    console.log(`Среди доступных фидов нет: ${missing.join(", ")} — беру их по номеру, как указано.`);
  }
  return picked;
}

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
  /*
   * Счётчик запросов живёт сутками, место в обходе — нет. Мест теперь много:
   * у каждой пары «фид + категория» свой курсор, иначе круговой обход после
   * перезапуска начинался бы сначала везде.
   */
  const where = { spots: stored?.spots ?? {}, lap: stored?.lap ?? 0 };
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

/**
 * Отпечаток товара: набор значимых слов названия.
 *
 * Одно и то же платье выкладывают полсотни продавцов, слово в слово копируя
 * название друг у друга и переставляя пару слов местами. На свайпах такая
 * витрина читается как «тут ничего нет»: человек видит один товар подряд
 * десять раз. Сравнивать по идентификатору бесполезно — он у каждой
 * перепродажи свой.
 *
 * Слова сортируются, поэтому перестановка не мешает; берём первые
 * двенадцать значимых — остальное у таких названий чистый мусор из
 * ключевых слов.
 */
function fingerprint(p) {
  const words = String(p.title)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .split(" ")
    // Числа оставляем любой длины: «iPhone 15» и «iPhone 14» — разные
    // товары, и потерять «15» значит склеить их в один.
    .filter((w) => w.length >= 3 || /\d/.test(w))
    .slice(0, 12)
    .sort();
  return words.length >= 3 ? words.join(" ") : null;
}

/** Из двух одинаковых оставляем ту, что убедительнее выглядит в ленте. */
function better(a, b) {
  if ((a.soldCount ?? 0) !== (b.soldCount ?? 0)) return (a.soldCount ?? 0) > (b.soldCount ?? 0) ? a : b;
  if ((a.rating ?? 0) !== (b.rating ?? 0)) return (a.rating ?? 0) > (b.rating ?? 0) ? a : b;
  return (a.price ?? Infinity) <= (b.price ?? Infinity) ? a : b;
}

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
    const all = args.feed && args.feed !== true ? [] : await listFeeds();
    const feeds = chosenFeeds(all);
    console.log(`Фидов доступно: ${all.length || feeds.length}`);
    // Печатаем все до одного: список короткий, а пропущенный фид — это
    // пропущенный раздел витрины.
    for (const f of feeds) console.log(`  ${f.id} — ${f.title}`);
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

  const feeds = chosenFeeds(args.feed && args.feed !== true ? [] : await listFeeds());
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
  let twins = 0;
  const dumped = [];

  /*
   * Указатель «отпечаток → идентификатор»: по нему новая карточка узнаётся
   * как копия уже имеющейся. Строится и по старому снапшоту тоже, поэтому
   * первый же прогон после обновления подчистит накопленные дубли.
   */
  const byPrint = new Map();
  if (DEDUP) {
    for (const p of known.values()) {
      const print = fingerprint(p);
      if (!print) continue;
      const rival = byPrint.get(print);
      if (!rival) {
        byPrint.set(print, p.id);
        continue;
      }
      const keep = better(known.get(rival), p);
      const drop = keep.id === rival ? p.id : rival;
      known.delete(drop);
      byPrint.set(print, keep.id);
      twins += 1;
    }
    if (twins) console.log(`В снапшоте склеено дублей: ${twins}`);
  }

  /**
   * Места обхода: каждая пара «фид + категория» — отдельная точка со своим
   * курсором и своей квотой. Список категорий спрашивается один раз за
   * прогон, это по запросу на фид.
   */
  const spots = [];
  for (const feed of feeds) {
    const categories = await listCategories(feed.id);
    if (categories.length) {
      console.log(`Фид ${feed.id}: категорий ${categories.length}`);
      for (const c of categories) spots.push({ key: `${feed.id}:${c.id}`, feed, category: c });
    } else {
      spots.push({ key: `${feed.id}:*`, feed, category: null });
    }
  }
  console.log(`Точек обхода: ${spots.length}`);

  /*
   * Квота на категорию: чтобы одна не заняла собой весь каталог. Но когда
   * категорий мало, доля в шесть процентов означала бы, что каталог не
   * наберётся никогда, — поэтому не меньше честной доли с запасом в
   * полтора раза. Считается страницами по сотне, так что фактический
   * перебор возможен на страницу-другую: на тысячах это доли процента.
   */
  const fair = Math.ceil((MAX_PRODUCTS * 1.5) / spots.length);
  const perSpot = Math.max(PAGE, Math.round(MAX_PRODUCTS * QUOTA_SHARE), fair);
  console.log(`Потолок на категорию: ${perSpot} карточек`);

  for (const spot of spots) {
    const saved = ledger.spots[spot.key] ?? {};
    spot.cursor = saved.cursor ?? "";
    spot.got = saved.got ?? 0;
    spot.done = !!saved.done;
  }

  /**
   * Обход по кругу: от каждой точки берём по паре страниц и идём дальше.
   * Круг без единой новой карточки означает, что брать больше нечего.
   */
  let lap = 0;
  let stop = false;
  while (!stop) {
    const live = spots.filter((s) => !s.done && !s.quiet && s.got < perSpot);
    if (!live.length) {
      console.log("Все категории дошли до конца или до своей квоты.");
      break;
    }

    lap += 1;
    const addedAtLapStart = added;

    for (const spot of live) {
      const hadBefore = added;
      for (let page = 0; page < LAP_PAGES; page++) {
        if (spent.calls + 1 > left) {
          console.log("Бюджет на сегодня закончился — продолжим завтра с этого же места.");
          stop = true;
          break;
        }
        if (known.size >= MAX_PRODUCTS) {
          console.log(`Каталог добрал до потолка (${MAX_PRODUCTS}) — останавливаемся.`);
          stop = true;
          break;
        }
        if (spot.done || spot.got >= perSpot) break;

        let got;
        try {
          got = await productsPage(spot.feed.id, spot.cursor, spot.category?.id);
        } catch (e) {
          if (e instanceof AeError && e.status === 429) {
            console.log("Платформа просит притормозить — на сегодня заканчиваем.");
            stop = true;
            break;
          }
          throw e;
        }

        let fresh = 0;
        for (const raw of got.items) {
          if (dumped.length < 20 && DUMP) dumped.push(raw);
          // Категория берётся из обхода: в самом товаре её нет. Без категорий
          // у фида остаётся его собственное название.
          const product = toProduct(raw, spot.category?.title ?? spot.feed.title);
          if (!usable(product)) {
            skipped += 1;
            continue;
          }

          const print = DEDUP ? fingerprint(product) : null;
          const rivalId = print ? byPrint.get(print) : undefined;
          if (rivalId && rivalId !== product.id) {
            // Тот же товар у другого продавца: оставляем убедительнейший,
            // второй не показываем вовсе.
            const rival = known.get(rivalId);
            if (rival) {
              const keep = better(rival, product);
              if (keep.id !== rivalId) {
                known.delete(rivalId);
                known.set(product.id, product);
                byPrint.set(print, product.id);
              }
              twins += 1;
              continue;
            }
          }

          if (!known.has(product.id)) {
            if (known.size >= MAX_PRODUCTS) continue;
            added += 1;
            fresh += 1;
            spot.got += 1;
          }
          known.set(product.id, product);
          if (print) byPrint.set(print, known.get(product.id).id);
        }

        spot.cursor = got.next;
        // Курсор пуст или страница пришла пустой — категория кончилась.
        if (!spot.cursor || !got.items.length) {
          spot.done = true;
          break;
        }
        if (!fresh) {
          // Страница целиком из уже известного: курсор сохраняем — вдруг
          // дальше есть новое, — но на этом круге точку оставляем.
          break;
        }
        await pause(DELAY);
      }

      /*
       * Категория, которая три круга подряд не дала ничего нового, на
       * сегодня откладывается. Это про прогоны после смены обхода: прежний
       * импортёр вычерпывал категории вглубь, и перечитывать их страницы по
       * второму разу — значит тратить дневной бюджет впустую, пока соседние
       * категории стоят нетронутыми. Завтра к ней вернёмся: в журнале она
       * остаётся живой.
       */
      spot.idle = added > hadBefore ? 0 : (spot.idle ?? 0) + 1;
      if (spot.idle >= 3) {
        spot.quiet = true;
        console.log(`  ${spot.feed.id}${spot.category ? ` / ${spot.category.title}` : ""}: нового нет, откладываю до завтра`);
      }
      if (stop) break;
    }

    console.log(
      `Круг ${lap}: добавлено ${added - addedAtLapStart}, в каталоге ${known.size}` +
        (twins ? `, склеено дублей ${twins}` : ""),
    );
    if (added === addedAtLapStart) {
      console.log("Круг не дал ни одной новой карточки — на сегодня всё.");
      break;
    }
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
    lap,
    spots: Object.fromEntries(spots.map((s) => [s.key, { cursor: s.cursor, got: s.got, done: s.done }])),
  });

  if (DUMP && dumped.length) {
    writeFileSync(DUMP, JSON.stringify(dumped, null, 2));
    console.log(`Сырые ответы (${dumped.length} шт.) записаны в ${DUMP}`);
  }

  console.log(
    `Готово: было ${before}, стало ${products.length} (+${added}). ` +
      (skipped ? `Без картинки или цены пропущено ${skipped}. ` : "") +
      (twins ? `Склеено дублей: ${twins}. ` : "") +
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
