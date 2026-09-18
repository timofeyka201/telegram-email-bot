import catalog from "../../../data/catalog.json";
import { categoryLabel } from "../categories";
import type { Product } from "../types";
import { toRub } from "../money";
import type { TasteHint } from "../taste";
import { decodeCursor, encodeCursor, mulberry32, shuffle, type Filters, type PageArgs, type Provider, type ProviderPage } from "./types";

/**
 * Собственная база товаров: файл data/catalog.json, который отдаётся
 * постранично. Ни от каких внешних API не зависит — а значит, не ловит ни
 * лимитов, ни блокировок по IP, которыми маркетплейсы встречают серверные
 * запросы из дата-центров.
 *
 * Наполняется двумя способами: scripts/make-seed.mjs (синтетика для старта)
 * и scripts/build-catalog.mjs (настоящие товары с маркетплейса).
 */

type CatalogFile = {
  version: number;
  kind: string;
  generatedAt?: string;
  categories?: string[];
  products: Product[];
};

const FILE = catalog as unknown as CatalogFile;
const ALL: Product[] = Array.isArray(FILE.products) ? FILE.products : [];
const PAGE = 12;

/**
 * Категории приходят из разных источников разными слагами: «furniture» и
 * «Furniture» — это одно и то же. Схлопываем их по русскому ярлыку, он же
 * становится значением фильтра. Одиночные категории в список не берём: выбирать
 * из них нечего, а строку фильтров они забивают.
 */
function buildCategoryFacets(): string[] {
  const counts = new Map<string, number>();
  for (const p of ALL) {
    if (!p.category) continue;
    const label = categoryLabel(p.category);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru"))
    .map(([label]) => label);
}

/**
 * Цены отложенных товаров. Идентификаторы с суффиксом круга («-r1») указывают
 * на тот же товар, поэтому суффикс отбрасываем.
 */
export function currentPrices(ids: string[]): Record<string, number> {
  const byId = new Map(ALL.map((p) => [p.id, p]));
  const out: Record<string, number> = {};
  for (const id of ids) {
    const base = id.replace(/-r\d+$/, "");
    const price = byId.get(base)?.price;
    if (price !== undefined) out[id] = price;
  }
  return out;
}

/** Диапазон цен и список категорий нужны панели фильтров. */
export const catalogFacets = {
  categories: buildCategoryFacets(),
  maxPrice: ALL.reduce((max, p) => (p.price !== undefined && p.price > max ? p.price : max), 0),
  currency: ALL[0]?.currency ?? "RUB",
};

export const catalogMeta = {
  kind: FILE.kind ?? "unknown",
  generatedAt: FILE.generatedAt ?? null,
  total: ALL.length,
  categories: FILE.categories ?? [...new Set(ALL.map((p) => p.category).filter(Boolean) as string[])],
};

/** Поиск по названию, категории, бренду и характеристикам — без внешних сервисов. */
function match(p: Product, q: string): boolean {
  const needle = q.toLowerCase();
  if (p.title.toLowerCase().includes(needle)) return true;
  if (p.category?.toLowerCase().includes(needle)) return true;
  if (p.brand?.toLowerCase().includes(needle)) return true;
  return p.attributes.some((a) => a.value.toLowerCase().includes(needle));
}

/** Фильтры применяются к своей базе — у неё есть и категории, и цены. */
function passes(p: Product, f?: Filters): boolean {
  if (!f) return true;
  // В фильтре лежат ярлыки, а не слаги — так совпадают синонимы из разных источников.
  if (f.categories?.length && (!p.category || !f.categories.includes(categoryLabel(p.category)))) return false;
  if (f.maxPrice !== undefined && (p.price === undefined || p.price > f.maxPrice)) return false;
  if (f.onlyDiscount && !(p.priceMax !== undefined && p.price !== undefined && p.priceMax > p.price)) return false;
  return true;
}

/**
 * Оценка товара под профиль вкуса. Считается так, чтобы ни один сигнал не
 * перебивал остальные полностью: лента должна подстраиваться, но не схлопываться
 * в одну категорию.
 */
function score(p: Product, hint: TasteHint | undefined, rnd: () => number): number {
  // Небольшой шум не даёт ленте застыть в одном и том же порядке.
  let value = rnd() * 1.2;
  if (!hint) return value;

  const label = p.category ? categoryLabel(p.category) : undefined;
  if (label && hint.picked?.includes(label)) value += 3;
  if (label && hint.categories) value += hint.categories[label] ?? 0;
  if (p.brand && hint.brands) value += (hint.brands[p.brand] ?? 0) * 0.7;

  if (hint.budget !== undefined && p.price !== undefined) {
    const rub = toRub(p.price, p.currency, hint.rates ?? {}) ?? p.price;
    // Выход за бюджет наказывается тем сильнее, чем сильнее превышение.
    if (rub > hint.budget) value -= Math.min(4, 1.5 + (rub / hint.budget - 1) * 2);
  }
  return value;
}

export const localProvider: Provider = {
  id: "local",
  label: "Своя база",
  note: `${ALL.length} карточек в репозитории. Работает всегда, без внешних API.`,
  needsToken: false,
  ready: () => ALL.length > 0,

  async page({ query, cursor, seed, filters, hint }: PageArgs): Promise<ProviderPage> {
    const { offset, round } = decodeCursor(cursor);

    // Отвергнутое исключаем жёстко: свайп влево — это «больше не показывай».
    const banned = new Set(hint?.exclude ?? []);
    const pool = ALL.filter(
      (p) => !banned.has(p.id) && (query ? match(p, query) : true) && passes(p, filters),
    );
    // Пустой результат — не повод показывать пустоту: откатываемся к витрине.
    const source = pool.length ? pool : ALL.filter((p) => !banned.has(p.id));
    if (!source.length) return { products: [], cursor: encodeCursor(0, round), looped: false };

    // Порядок свой на каждый круг и на каждую сессию — лента не повторяется.
    const rnd = mulberry32(seed + round * 104729);
    const ordered = hint
      ? source
          .map((p) => ({ p, s: score(p, hint, rnd) }))
          .sort((a, b) => b.s - a.s)
          .map((x) => x.p)
      : shuffle(source, seed + round * 104729);
    const slice = ordered.slice(offset, offset + PAGE);

    // Каталог конечен, поэтому на краю начинаем новый круг: карточки в ленте
    // не заканчиваются, а суффикс круга не даёт совпасть идентификаторам.
    if (!slice.length) {
      const next = shuffle(source, seed + (round + 1) * 104729).slice(0, PAGE);
      return {
        products: next.map((p) => ({ ...p, id: `${p.id}-r${round + 1}` })),
        cursor: encodeCursor(PAGE, round + 1),
        looped: true,
      };
    }

    const products = round > 0 ? slice.map((p) => ({ ...p, id: `${p.id}-r${round}` })) : slice;
    return { products, cursor: encodeCursor(offset + PAGE, round), looped: false };
  },
};
