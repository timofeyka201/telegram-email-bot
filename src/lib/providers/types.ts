import type { Product } from "../types";

export type PageArgs = {
  /** поисковый запрос, пустая строка — вся витрина */
  query: string;
  /** непрозрачный курсор предыдущей страницы, null — начало ленты */
  cursor: string | null;
  /** зерно перетасовки: разные сессии видят разный порядок */
  seed: number;
};

export type ProviderPage = {
  products: Product[];
  /** курсор следующей страницы; провайдер обязан вернуть его всегда */
  cursor: string;
  /** каталог пошёл на новый круг */
  looped: boolean;
};

export type Provider = {
  id: string;
  label: string;
  /** одна строка для интерфейса: что это за источник */
  note: string;
  /** нужен ли токен в переменных окружения */
  needsToken: boolean;
  /** готов ли провайдер отвечать прямо сейчас */
  ready: () => boolean;
  page: (args: PageArgs) => Promise<ProviderPage>;
};

/** Курсор вида "смещение.круг" — читаемый в логах и не требующий кодирования. */
export function encodeCursor(offset: number, round: number): string {
  return `${offset}.${round}`;
}

export function decodeCursor(cursor: string | null): { offset: number; round: number } {
  if (!cursor) return { offset: 0, round: 0 };
  const [a, b] = cursor.split(".");
  const offset = Number(a);
  const round = Number(b);
  return { offset: Number.isFinite(offset) ? offset : 0, round: Number.isFinite(round) ? round : 0 };
}

/** Детерминированный PRNG: один и тот же seed даёт один и тот же порядок. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(list: T[], seed: number): T[] {
  const rnd = mulberry32(seed);
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
