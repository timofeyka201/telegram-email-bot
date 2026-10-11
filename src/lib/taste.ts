import type { Product } from "./types";

/**
 * Профиль вкуса. Складывается из двух источников: теста при первом запуске
 * (что человек сам про себя сказал) и поведения в ленте (что он на самом деле
 * делает). Второе со временем перевешивает первое, поэтому вес поведения растёт
 * с каждым решением, а ответы теста остаются постоянной добавкой.
 */
export type Taste = {
  /** категории, выбранные в тесте */
  picked: string[];
  /** верхняя граница цены из теста, в рублях */
  budget?: number;
  /** накопленные предпочтения: ключ → вес (может быть отрицательным) */
  categories: Record<string, number>;
  brands: Record<string, number>;
  /** причины отказов: помогают понять, что именно отталкивает */
  reasons: Record<string, number>;
  /** когда веса в последний раз пересчитывались с поправкой на время */
  decayedAt?: number;
};

export const emptyTaste = (): Taste => ({ picked: [], categories: {}, brands: {}, reasons: {} });

/**
 * Затухание: вкус без подтверждения тает на 10% каждые двое суток.
 *
 * Без этого один отказ в плохом настроении хоронит категорию навсегда:
 * шесть свайпов влево уводят её в −8, и вернуть её может только случай —
 * разведка её не предлагает, а значит и лайкнуть нечего. Люди меняются
 * быстрее, чем «никогда».
 *
 * Считается непрерывно, а не ступеньками: 10% за двое суток — это
 * 0.9^(дней/2), и результат не зависит от того, когда приложение открывали.
 * Поэтому пересчёт идемпотентен и каждому устройству можно считать самому,
 * ничего не синхронизируя.
 */
const DECAY_STEP = 0.9;
const DECAY_DAYS = 2;
/** Вес меньше этого — шум: забываем совсем, чтобы профиль не разрастался. */
const FORGET_BELOW = 0.3;
/** Чаще раза в час пересчитывать нечего. */
const MIN_GAP = 3600_000;

export function decay(taste: Taste, now = Date.now()): Taste {
  const since = taste.decayedAt;
  // Профиль, заведённый до появления затухания: время отсчитываем с этого
  // момента, задним числом ничего не отнимаем.
  if (!since) return { ...taste, decayedAt: now };
  if (now - since < MIN_GAP) return taste;

  const days = (now - since) / 86_400_000;
  const k = DECAY_STEP ** (days / DECAY_DAYS);
  const fade = (map: Record<string, number>) =>
    Object.fromEntries(
      Object.entries(map)
        .map(([key, value]) => [key, value * k] as const)
        .filter(([, value]) => Math.abs(value) >= FORGET_BELOW),
    );

  return { ...taste, categories: fade(taste.categories), brands: fade(taste.brands), decayedAt: now };
}

/** Что можно ответить, отказываясь от товара. */
export const REJECT_REASONS = [
  { id: "price", label: "Слишком дорого" },
  { id: "category", label: "Не та категория" },
  { id: "look", label: "Не нравится внешне" },
  { id: "quality", label: "Сомневаюсь в качестве" },
  { id: "have", label: "Уже есть такое" },
  { id: "size", label: "Нет моего размера" },
] as const;

export type RejectReason = (typeof REJECT_REASONS)[number]["id"];

const bump = (map: Record<string, number>, key: string | undefined, delta: number) => {
  if (!key) return;
  map[key] = Math.max(-8, Math.min(8, (map[key] ?? 0) + delta));
};

/**
 * Свайп влево — явный отказ, и весит он больше лайка: человеку проще
 * пролистнуть что угодно, чем осознанно отвергнуть.
 */
export function learn(taste: Taste, product: Product, decision: "like" | "dislike" | "super"): Taste {
  const next: Taste = {
    ...taste,
    categories: { ...taste.categories },
    brands: { ...taste.brands },
    reasons: { ...taste.reasons },
  };
  const weight = decision === "super" ? 2 : decision === "like" ? 1 : -1.4;
  bump(next.categories, product.category, weight);
  bump(next.brands, product.brand, weight * 0.7);
  return next;
}

/**
 * Отмена решения: снимаем ровно то, что начислили.
 *
 * Раньше отмена применяла противоположный свайп — отмена лайка списывала 1.4
 * вместо начисленной единицы, отмена отказа возвращала 1 вместо 1.4. При
 * частых отменах профиль медленно сползал в минус. На границах (вес упёрся в
 * ±8) точность всё равно теряется: сколько было отброшено ограничителем, уже
 * не узнать.
 */
export function unlearn(taste: Taste, product: Product, decision: "like" | "dislike" | "super"): Taste {
  const next: Taste = {
    ...taste,
    categories: { ...taste.categories },
    brands: { ...taste.brands },
    reasons: { ...taste.reasons },
  };
  const weight = -(decision === "super" ? 2 : decision === "like" ? 1 : -1.4);
  bump(next.categories, product.category, weight);
  bump(next.brands, product.brand, weight * 0.7);
  return next;
}

/**
 * Переход в магазин — самый сильный сигнал, какой у витрины есть.
 *
 * Свайп стоит человеку одно движение, а уход в магазин — это намерение
 * купить: дальше он уже платит. Поэтому весит он больше «в корзину» и
 * сильно больше лайка.
 */
export function learnVisit(taste: Taste, product: Product): Taste {
  const next: Taste = {
    ...taste,
    categories: { ...taste.categories },
    brands: { ...taste.brands },
    reasons: { ...taste.reasons },
  };
  bump(next.categories, product.category, 3);
  bump(next.brands, product.brand, 2.1);
  return next;
}

/** Причина отказа уточняет профиль сильнее, чем сам свайп. */
export function learnReason(taste: Taste, product: Product, reason: RejectReason, priceRub?: number): Taste {
  const next: Taste = {
    ...taste,
    categories: { ...taste.categories },
    brands: { ...taste.brands },
    reasons: { ...taste.reasons },
  };
  next.reasons[reason] = (next.reasons[reason] ?? 0) + 1;

  if (reason === "category") bump(next.categories, product.category, -2.5);
  if (reason === "look") bump(next.brands, product.brand, -1.5);
  if (reason === "quality") bump(next.brands, product.brand, -2);
  // «Дорого» — не про товар, а про планку: опускаем бюджет к этой цене.
  if (reason === "price" && priceRub !== undefined) {
    next.budget = next.budget === undefined ? priceRub * 0.8 : Math.min(next.budget, priceRub * 0.85);
  }
  return next;
}

/** Компактная выжимка для запроса ленты: полный профиль серверу не нужен. */
export type TasteHint = {
  picked?: string[];
  budget?: number;
  /** курсы нужны там, где считается попадание в бюджет */
  rates?: Record<string, number>;
  categories?: Record<string, number>;
  brands?: Record<string, number>;
  exclude?: string[];
};

export function toHint(taste: Taste, excludeIds: string[], rates?: Record<string, number>): TasteHint {
  const trim = (map: Record<string, number>) =>
    Object.fromEntries(
      Object.entries(map)
        .filter(([, v]) => Math.abs(v) >= 0.5)
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
        .slice(0, 40),
    );
  return {
    picked: taste.picked.length ? taste.picked : undefined,
    budget: taste.budget,
    rates,
    categories: trim(taste.categories),
    brands: trim(taste.brands),
    // Список показанного не должен раздуваться бесконечно: это тело запроса,
    // которое уходит с телефона на каждой подгрузке.
    exclude: excludeIds.slice(0, 800),
  };
}
