import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DEFAULT_RATES } from "./money";

export type RateSnapshot = {
  /** Сколько рублей стоит одна единица валюты. */
  rates: Record<string, number>;
  /** День, на который Центробанк установил курс. */
  date: string | null;
  source: string;
  fetchedAt: number;
};

/** Валюты, которые встречаются у наших источников товаров. */
const WANTED = ["USD", "EUR", "GBP", "CNY"];

/**
 * Центробанк публикует курс раз в рабочий день около 11:30 по Москве, так что
 * чаще нескольких раз в сутки ходить незачем. Шесть часов — чтобы свежий курс
 * появлялся в тот же день, в какую бы сторону ни сдвинулась публикация.
 */
const TTL = 6 * 60 * 60 * 1000;
/** Чужой сервер нам ничего не должен: ждём недолго и живём на прошлом курсе. */
const TIMEOUT = 8000;

/**
 * Два источника, и оба — Центробанк. Первый отдаёт готовый JSON, второй —
 * официальный XML с cbr.ru. Зеркало удобнее, но однажды оно пропадёт, а
 * первоисточник останется.
 */
const JSON_SOURCE = process.env.RATES_URL?.trim() || "https://www.cbr-xml-daily.ru/daily_json.js";
const XML_SOURCE = process.env.RATES_URL_XML?.trim() || "https://www.cbr.ru/scripts/XML_daily.asp";

/** Файл с последним известным курсом. Лежит рядом с остальными данными. */
function ratesPath(): string {
  const configured = process.env.RATES_FILE?.trim();
  if (configured) return configured;
  const auth = process.env.AUTH_FILE?.trim();
  return auth ? join(dirname(auth), "rates.json") : ".data/rates.json";
}

const fallback = (): RateSnapshot => ({
  rates: { ...DEFAULT_RATES, GBP: DEFAULT_RATES.EUR },
  date: null,
  source: "запасной курс в коде",
  fetchedAt: 0,
});

let cache: RateSnapshot | null = null;
/** Один запрос на всех: десять одновременных читателей не должны звать ЦБ десять раз. */
let inFlight: Promise<RateSnapshot> | null = null;

async function get(url: string): Promise<Response> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT), cache: "no-store" });
  if (!res.ok) throw new Error(`${url} ответил ${res.status}`);
  return res;
}

/** Проверка на месте: курс приходит из внешнего мира и бывает любым. */
function sane(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value < 100000;
}

/** JSON-зеркало ЦБ: {"Date":"…","Valute":{"USD":{"Nominal":1,"Value":88.5},…}} */
async function fromJson(): Promise<RateSnapshot> {
  const data = (await (await get(JSON_SOURCE)).json()) as {
    Date?: string;
    Valute?: Record<string, { Nominal?: number; Value?: number }>;
  };
  const rates: Record<string, number> = {};
  for (const code of WANTED) {
    const v = data.Valute?.[code];
    // Номинал у юаня равен десяти: без деления цена товара вырастет вдесятеро.
    const nominal = sane(v?.Nominal) ? v.Nominal : 1;
    if (v && sane(v.Value)) rates[code] = v.Value / nominal;
  }
  return { rates, date: data.Date?.slice(0, 10) ?? null, source: "ЦБ РФ", fetchedAt: Date.now() };
}

/** Официальный XML ЦБ: плоский список <Valute><CharCode>…<Nominal>…<Value>88,5000 */
async function fromXml(): Promise<RateSnapshot> {
  // ЦБ отдаёт XML в windows-1251, но нужные нам поля — латиница и цифры,
  // поэтому декодируем как latin1: кириллические названия валют мы не читаем.
  const text = Buffer.from(await (await get(XML_SOURCE)).arrayBuffer()).toString("latin1");
  const rates: Record<string, number> = {};
  const re =
    /<CharCode>([A-Z]{3})<\/CharCode>\s*<Nominal>(\d+)<\/Nominal>[\s\S]*?<Value>([\d,.]+)<\/Value>/g;
  for (const [, code, nominal, raw] of text.matchAll(re)) {
    if (!WANTED.includes(code)) continue;
    // Десятичный разделитель у ЦБ — запятая.
    const value = Number(raw.replace(",", "."));
    const per = Number(nominal) || 1;
    if (sane(value)) rates[code] = value / per;
  }
  const date = /Date="(\d{2})\.(\d{2})\.(\d{4})"/.exec(text);
  return {
    rates,
    date: date ? `${date[3]}-${date[2]}-${date[1]}` : null,
    source: "ЦБ РФ",
    fetchedAt: Date.now(),
  };
}

async function readDisk(): Promise<RateSnapshot | null> {
  try {
    const saved = JSON.parse(await readFile(ratesPath(), "utf8")) as RateSnapshot;
    return saved.rates && Object.keys(saved.rates).length ? saved : null;
  } catch {
    return null;
  }
}

async function writeDisk(snapshot: RateSnapshot): Promise<void> {
  try {
    const path = ratesPath();
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.tmp`;
    await writeFile(tmp, JSON.stringify(snapshot));
    await rename(tmp, path);
  } catch (e) {
    console.error("Курс не сохранён на диск:", e instanceof Error ? e.message : e);
  }
}

/** Достраиваем то, чего источник не дал, чтобы цена не осталась без пересчёта. */
function complete(rates: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = { ...rates, RUB: 1 };
  for (const code of WANTED) if (!sane(out[code])) out[code] = DEFAULT_RATES[code] ?? DEFAULT_RATES.EUR;
  return out;
}

async function refresh(): Promise<RateSnapshot> {
  for (const [name, load] of [
    ["JSON", fromJson],
    ["XML", fromXml],
  ] as const) {
    try {
      const snapshot = await load();
      // Пустой ответ бывает и с кодом 200 — принимаем только с валютами.
      if (Object.keys(snapshot.rates).length) {
        const complete_ = { ...snapshot, rates: complete(snapshot.rates) };
        cache = complete_;
        await writeDisk(complete_);
        return complete_;
      }
      console.error(`Курс (${name}): ответ без валют`);
    } catch (e) {
      console.error(`Курс (${name}) не получен:`, e instanceof Error ? e.message : e);
    }
  }

  // Ни один источник не ответил. Вчерашний курс лучше выдуманного.
  const stale = cache ?? (await readDisk());
  if (stale) {
    cache = stale;
    return stale;
  }
  return fallback();
}

/**
 * Курс валют к рублю. Берётся у Центробанка, живёт в памяти и на диске:
 * приложение не должно ходить в сеть ради каждой карточки, а перезапуск
 * службы не должен возвращать цены к выдуманным числам.
 */
export async function currentRates(): Promise<RateSnapshot> {
  if (!cache) cache = await readDisk();
  const fresh = cache && Date.now() - cache.fetchedAt < TTL;
  if (fresh) return cache!;

  // Курс устарел, но он есть: отдаём его сразу, а обновление идёт следом.
  // Иначе первый человек после полуночи ждал бы ответа чужого сервера.
  if (cache) {
    if (!inFlight) inFlight = refresh().finally(() => (inFlight = null));
    return cache;
  }

  if (!inFlight) inFlight = refresh().finally(() => (inFlight = null));
  return inFlight;
}
