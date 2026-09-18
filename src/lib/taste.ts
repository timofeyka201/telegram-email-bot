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
};

export const emptyTaste = (): Taste => ({ picked: [], categories: {}, brands: {}, reasons: {} });

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
    // Список отвергнутого не должен раздуваться бесконечно.
    exclude: excludeIds.slice(0, 600),
  };
}
