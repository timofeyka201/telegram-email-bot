import { createServer } from "node:http";
/**
 * Поддельная AE Platform: отвечает в тех же форматах, что настоящая, и умеет
 * ломаться так же — выбивать токен, отдавать 401 и 429. Нужна, чтобы прогонять
 * импортёр, не тратя ни ключ, ни лимиты реальной площадки.
 */
const PER_FEED = Number(process.env.FAKE_PER_FEED ?? 450);
const FEEDS = [
  { id: "104", title: "Спорт. Автомобили и мотоциклы" },
  { id: "103", title: "Дом, сад и офис. Обустройство дома и инструменты. Бытовая техника" },
];
const CATEGORIES = { 200000297: "Телефоны и аксессуары", 200000343: "Дом и сад" };

let issued = null; // действующим считается только последний выданный токен
let mode = "ok";
const seen = new Set();
let calls = 0;

/**
 * Товар в том виде, в каком его отдаёт настоящий фид: JSON:API с attributes,
 * цена объектом в копейках, картинки галереей, категории нет вовсе.
 */
const product = (feed, i) => ({
  type: "product",
  id: `0_1005${feed}3678${String(i).padStart(5, "0")}`,
  attributes: {
    commissionRate: 86500,
    imageGallery: [
      `https://ae-pic-a1.aliexpress-media.com/kf/S${feed}-${i}-1.jpg_480x480.jpg`,
      `https://ae-pic-a1.aliexpress-media.com/kf/S${feed}-${i}-2.jpg_480x480.jpg`,
    ],
    imageURL: `https://ae-pic-a1.aliexpress-media.com/kf/S${feed}-${i}-1.jpg_480x480.jpg`,
    isAffiliate: true,
    isLocal: i % 3 === 0,
    itemId: Number(`1005${feed}3678${String(i).padStart(5, "0")}`),
    pageURL: `https://aliexpress.ru/item/1005${feed}3678${String(i).padStart(5, "0")}.html?sku_id=12000015830602450`,
    price: { cents: 11000 + i * 100, currency: "RUB" },
    productFeedId: Number(feed),
    publisherCommissionRaw: "Комиссия до 8.65%",
    purchasesAmount: 124009 - i,
    rating: 4.8,
    sellerId: 243689844,
    sourceId: 0,
    store: { title: `Магазин ${feed}`, url: "https://aliexpress.ru/store/900246057" },
    title: `Вибро блесна SANMO ${feed}-${i}`,
  },
});

const json = (res, code, body) => {
  res.statusCode = code;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
};

createServer(async (req, res) => {
  calls += 1;
  const url = new URL(req.url, "http://x");
  const p = url.pathname;

  if (p === "/mode") {
    mode = url.searchParams.get("m") ?? "ok";
    return res.end("ok");
  }
  if (p === "/stats") return json(res, 200, { calls, unique: seen.size, issued: !!issued });

  if (p === "/token") {
    let body = "";
    for await (const chunk of req) body += chunk;
    const form = new URLSearchParams(body);
    if (form.get("grant_type") !== "client_credentials") return json(res, 400, { error: "bad request" });

    // Площадка может требовать ключи заголовком Basic, а не в теле: режим
    // «basic» проверяет, что клиент это переживает.
    const basic = (req.headers.authorization ?? "").startsWith("Basic ");
    if (mode === "basic" && !basic) {
      return json(res, 401, { error: "invalid_client", error_description: "Client authentication failed" });
    }
    // Неверные ключи: ровно тот ответ, который видит человек с опечаткой.
    if (mode === "badkey") {
      return json(res, 401, { error: "invalid_client", error_description: "Client authentication failed" });
    }
    if (!basic && (!form.get("client_id") || !form.get("client_secret"))) {
      return json(res, 401, { error: "invalid_client", error_description: "Client authentication failed" });
    }
    // Новый токен убивает прежний — ровно как на настоящей платформе.
    const payload = Buffer.from(
      JSON.stringify({ user_id: 7777, user_role: "kol", client_id: form.get("client_id") ?? "basic" }),
    ).toString("base64url");
    issued = `eyJhbGciOiJIUzUxMiJ9.${payload}.${Math.random().toString(36).slice(2, 10)}`;
    return json(res, 200, {
      access_token: issued,
      token_type: "jwt",
      expires_in: "1800",
      scope: "productfeeds creatives placements link:affiliate:check",
    });
  }

  // Всё остальное требует действующего токена и правильной схемы заголовка.
  const auth = req.headers.authorization ?? "";
  const expected = `${process.env.FAKE_SCHEME ?? "Bearer"} ${issued}`.trim();
  if (!issued || auth !== expected) return json(res, 401, { code: 401006, message: "ParseToken" });
  if (mode === "429") return json(res, 429, { code: 429001, message: "NeedCaptcha" });

  if (p === "/api/v1/productsfeeds/feeds") {
    // У настоящей площадки предел размера страницы здесь 30, а не 100.
    const limit = Number(url.searchParams.get("limit") ?? 0);
    if (limit > 30) {
      return json(res, 422, {
        errors: [{ code: 422001, field: "limit", meta: { message: "Limit должен быть меньше или равно 30" } }],
      });
    }
    if (mode === "nofeeds") return json(res, 200, { data: [], meta: { total: "0" } });
    // Нумерация страниц с нуля: при page=1 первая страница уже пропущена.
    // Ровно так повела себя настоящая площадка — 12 фидов и пустой ответ.
    const zero = mode === "zeropage";
    const raw = url.searchParams.get("page");
    const page = raw === null ? (zero ? 0 : 1) : Number(raw);
    const index = zero ? page : Math.max(0, page - 1);
    const slice = FEEDS.slice(index * limit, (index + 1) * limit);
    return json(res, 200, { data: slice, meta: { total: FEEDS.length } });
  }

  if (p === "/api/v1/productsfeeds/categories") {
    return json(res, 200, {
      data: Object.entries(CATEGORIES).map(([id, title]) => ({ id, title })),
    });
  }

  if (p === "/api/v1/productsfeeds/products") {
    const feed = url.searchParams.get("productFeedId");
    const limit = Number(url.searchParams.get("limit") ?? 100);
    const cap = Number(process.env.FAKE_PRODUCTS_LIMIT ?? 100);
    if (limit > cap) {
      return json(res, 422, {
        errors: [{ code: 422001, field: "limit", meta: { message: `Limit должен быть меньше или равно ${cap}` } }],
      });
    }
    const cursor = url.searchParams.get("fromLastId") ?? "";
    // Курсор площадки — «0_<itemId>»; у нас последние пять цифр это номер.
    const from = cursor ? Number(cursor.split("_")[1].slice(-5)) : 0;
    const items = [];
    for (let i = from; i < Math.min(from + limit, PER_FEED); i++) {
      items.push(product(feed, i));
      seen.add(`${feed}-${i}`);
    }
    const nextIndex = from + items.length;
    return json(res, 200, {
      data: items,
      meta: {
        total: String(PER_FEED),
        nextFromLastId: nextIndex >= PER_FEED ? "" : `0_1005${feed}3678${String(nextIndex).padStart(5, "0")}`,
      },
    });
  }

  if (p.endsWith("/creative") || p.endsWith("/creative/sub-user")) {
    let body = "";
    for await (const chunk of req) body += chunk;
    const parsed = JSON.parse(body || "{}");
    const link = parsed.link ?? parsed.links?.[0] ?? "";
    const id = /item\/(\d+)/.exec(link)?.[1] ?? "0";
    const creative = {
      id: `500${id}`,
      link,
      productId: id,
      eridToken: "2SDnjdpgvgp",
      targetLink: `https://aliclick.shop/r/c/fake${id}?erid=2SDnjdpgvgp`,
      title: parsed.title ?? "креатив",
    };
    if (mode === "wrapped") {
      // Та же обёртка, что у фидов: вдруг и креатив приходит так.
      return json(res, 200, { data: { type: "creative", id: creative.id, attributes: creative } });
    }
    return json(res, 200, p.endsWith("sub-user") ? { creatives: [creative] } : creative);
  }

  if (p.endsWith("/placements/active")) {
    return json(res, 200, { placements: [{ id: "1", title: "swipers.ru" }], total: "1" });
  }

  json(res, 404, { code: 404001, message: "NotFound" });
}).listen(3340, () => console.log("поддельная AE Platform на 3340"));
