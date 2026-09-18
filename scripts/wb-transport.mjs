/**
 * Разные способы обратиться к маркетплейсу.
 *
 * Браузер на той же машине получает ответ, а запрос из Node — 403. Значит,
 * отличается не адрес, а сам запрос: набор заголовков, версия протокола или
 * отсутствие cookie. Какой именно вариант сработает, зависит от защиты на
 * стороне маркетплейса и со временем меняется, поэтому здесь не один
 * «правильный» способ, а несколько — рабочий выбирается проверкой.
 */
import http2 from "node:http2";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** Полный набор заголовков, который шлёт настоящий Chrome. */
const CHROME = {
  accept: "application/json, text/plain, */*",
  "accept-language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
  "cache-control": "no-cache",
  pragma: "no-cache",
  "sec-ch-ua": '"Chromium";v="126", "Google Chrome";v="126", "Not-A.Brand";v="99"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-site",
  "user-agent": UA,
};

const MINIMAL = { accept: "application/json", "user-agent": UA };

/** Профили перебираются сверху вниз; первый ответивший становится рабочим. */
export const PROFILES = [
  { id: "h2-chrome", label: "HTTP/2 с заголовками Chrome", transport: "h2", headers: CHROME },
  { id: "h2-chrome-origin", label: "HTTP/2 + Origin и Referer", transport: "h2",
    headers: { ...CHROME, origin: "https://www.wildberries.ru", referer: "https://www.wildberries.ru/" } },
  { id: "h1-chrome", label: "HTTP/1.1 с заголовками Chrome", transport: "h1", headers: CHROME },
  { id: "h1-chrome-origin", label: "HTTP/1.1 + Origin и Referer", transport: "h1",
    headers: { ...CHROME, origin: "https://www.wildberries.ru", referer: "https://www.wildberries.ru/" } },
  { id: "h1-minimal", label: "HTTP/1.1, минимум заголовков", transport: "h1", headers: MINIMAL },
];

// ------------------------------------------------------------------ HTTP/2
function h2Get(url, headers, timeoutMs) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const client = http2.connect(u.origin, { settings: { enablePush: false } });
    let done = false;
    const finish = (fn, arg) => {
      if (done) return;
      done = true;
      try { client.close(); } catch { /* уже закрыт */ }
      fn(arg);
    };

    const timer = setTimeout(() => finish(reject, new Error("таймаут")), timeoutMs);
    client.on("error", (e) => { clearTimeout(timer); finish(reject, e); });

    const req = client.request({
      ":method": "GET",
      ":path": u.pathname + u.search,
      ":authority": u.host,
      ":scheme": u.protocol.replace(":", ""),
      ...headers,
      // Сжатие не просим: распаковывать вручную здесь незачем.
      "accept-encoding": "identity",
    });

    let body = "";
    let status = 0;
    req.on("response", (h) => { status = Number(h[":status"]) || 0; });
    req.setEncoding("utf8");
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => { clearTimeout(timer); finish(resolve, { status, body }); });
    req.on("error", (e) => { clearTimeout(timer); finish(reject, e); });
    req.end();
  });
}

// ---------------------------------------------------------------- HTTP/1.1
async function h1Get(url, headers, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal, redirect: "follow" });
    return { status: res.status, body: await res.text() };
  } finally {
    clearTimeout(timer);
  }
}

/** Один запрос выбранным способом. Ошибки транспорта возвращаются, а не бросаются. */
export async function request(profile, url, { timeoutMs = 15000, cookies = "" } = {}) {
  const headers = cookies ? { ...profile.headers, cookie: cookies } : profile.headers;
  try {
    const get = profile.transport === "h2" ? h2Get : h1Get;
    return await get(url, headers, timeoutMs);
  } catch (e) {
    return { status: 0, body: "", error: e.message };
  }
}

/**
 * Заходит на главную, чтобы получить cookie: часть защит пропускает только
 * тех, у кого они уже есть.
 */
export async function warmCookies(origin = "https://www.wildberries.ru/") {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch(origin, {
      headers: { ...CHROME, accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "sec-fetch-dest": "document", "sec-fetch-mode": "navigate", "sec-fetch-site": "none" },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const raw = res.headers.getSetCookie?.() ?? [];
    return raw.map((c) => c.split(";")[0]).join("; ");
  } catch {
    return "";
  }
}

/**
 * Перебирает способы и возвращает первый, на который маркетплейс отвечает
 * содержательно. Заодно отдаёт таблицу результатов — по ней видно, что
 * происходит, если не сработал ни один.
 */
export async function pickProfile(probeUrl, { verbose = true } = {}) {
  const rows = [];

  for (const withCookies of [false, true]) {
    const cookies = withCookies ? await warmCookies() : "";
    if (withCookies && !cookies) continue; // cookie получить не удалось — вариант отпадает

    for (const profile of PROFILES) {
      const res = await request(profile, probeUrl, { cookies });
      const ok = res.status === 200 && res.body.includes('"products"');
      rows.push({
        profile: profile.id,
        label: profile.label + (withCookies ? " + cookie" : ""),
        status: res.status || res.error || "ошибка",
        ok,
      });
      if (verbose) {
        console.log(`  ${ok ? "✔" : "·"} ${profile.label}${withCookies ? " + cookie" : ""}: ${res.status || res.error}`);
      }
      if (ok) return { profile, cookies, rows };
    }
  }
  return { profile: null, cookies: "", rows };
}
