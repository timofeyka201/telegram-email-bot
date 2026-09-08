/**
 * Wildberries не отдаёт ссылки на фото — их собирают из id товара. Номер
 * CDN-корзины зависит от диапазона id, диапазоны со временем меняются, а число
 * корзин растёт. Поэтому здесь не таблица, а поиск: перебираем кандидатов
 * параллельно, первый ответивший выигрывает, результат кэшируется на диапазон.
 */

const BASKET_BASE = process.env.WB_BASKET_BASE || "";
const PROBE_TIMEOUT = 3500;
const MAX_BASKET = 40;

export const WB_REFERER = "https://www.wildberries.ru/";
export const WB_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

/** Варианты пути: у разных товаров доступны разные размеры и форматы. */
const VARIANTS = ["big/%N.webp", "c516x688/%N.webp", "big/%N.jpg", "c246x328/%N.webp"] as const;

export function volPart(id: number): { vol: number; part: number } {
  return { vol: Math.floor(id / 100000), part: Math.floor(id / 1000) };
}

export function basketHost(n: number): string {
  // На стенде корзины различаются префиксом пути — так перебор проверяется
  // целиком, а в проде (BASKET_BASE пуст) поведение обычное.
  return BASKET_BASE ? `${BASKET_BASE}/b${n}` : `https://basket-${String(n).padStart(2, "0")}.wbbasket.ru`;
}

export function buildUrl(host: string, id: number, index: number, variant: string): string {
  const { vol, part } = volPart(id);
  return `${host}/vol${vol}/part${part}/${id}/images/${variant.replace("%N", String(index))}`;
}

/** Историческая таблица — теперь лишь подсказка, с чего начинать перебор. */
function guessBasket(vol: number): number {
  const table: [number, number][] = [
    [143, 1], [287, 2], [431, 3], [719, 4], [1007, 5], [1061, 6], [1115, 7], [1169, 8],
    [1313, 9], [1601, 10], [1655, 11], [1919, 12], [2045, 13], [2189, 14], [2405, 15],
    [2621, 16], [2837, 17], [3053, 18], [3269, 19], [3485, 20], [3701, 21], [3917, 22],
    [4133, 23], [4349, 24], [4565, 25],
  ];
  for (const [max, n] of table) if (vol <= max) return n;
  // Дальше таблица не действует: у новых товаров корзина заметно больше.
  return Math.min(MAX_BASKET, 26 + Math.floor((vol - 4565) / 250));
}

/** Порядок проверки: подсказка, её окрестности, затем всё остальное. */
function candidateOrder(vol: number): number[] {
  const first = guessBasket(vol);
  const near: number[] = [];
  for (let d = 0; d <= MAX_BASKET; d++) {
    for (const n of d === 0 ? [first] : [first + d, first - d]) {
      if (n >= 1 && n <= MAX_BASKET && !near.includes(n)) near.push(n);
    }
  }
  return near;
}

type Resolved = { host: string; variant: string };
const cache = new Map<number, Resolved>();

async function probe(url: string): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT);
  try {
    // GET с диапазоном в один байт: HEAD некоторые CDN не обслуживают.
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Range: "bytes=0-0", Referer: WB_REFERER, "User-Agent": WB_UA, Accept: "image/*" },
    });
    if (!res.ok && res.status !== 206) return false;
    const type = res.headers.get("content-type") || "";
    return type.startsWith("image/");
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Находит рабочую пару «корзина + формат» для товара. Кандидаты проверяются
 * пачками параллельно, поэтому даже полный перебор занимает секунды, а не минуты.
 */
export async function resolveWbImage(id: number, index: number): Promise<string | null> {
  const { vol } = volPart(id);

  const hit = cache.get(vol);
  if (hit) return buildUrl(hit.host, id, index, hit.variant);

  const hosts = candidateOrder(vol);
  const BATCH = 8;

  for (const variant of VARIANTS) {
    for (let i = 0; i < hosts.length; i += BATCH) {
      const batch = hosts.slice(i, i + BATCH);
      const results = await Promise.all(
        batch.map(async (n) => {
          const host = basketHost(n);
          return (await probe(buildUrl(host, id, 1, variant))) ? host : null;
        }),
      );
      const host = results.find((h): h is string => h !== null);
      if (host) {
        cache.set(vol, { host, variant });
        return buildUrl(host, id, index, variant);
      }
    }
  }
  return null;
}

/** Для card.json нужен тот же хост, что и у фотографий. */
export async function resolveWbHost(id: number): Promise<string | null> {
  const { vol } = volPart(id);
  const hit = cache.get(vol);
  if (hit) return hit.host;
  const url = await resolveWbImage(id, 1);
  if (!url) return null;
  return cache.get(vol)?.host ?? null;
}

/** Диагностика: что именно отвечают кандидаты. Используется в /api/diag. */
export async function probeReport(id: number, limit = 10) {
  const { vol } = volPart(id);
  const hosts = candidateOrder(vol).slice(0, limit);
  const rows = await Promise.all(
    hosts.map(async (n) => {
      const host = basketHost(n);
      const url = buildUrl(host, id, 1, VARIANTS[0]);
      return { basket: n, url, ok: await probe(url) };
    }),
  );
  return { vol, guess: hosts[0], rows };
}
