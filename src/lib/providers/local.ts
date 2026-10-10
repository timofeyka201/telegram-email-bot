import { catalogCategories, catalogInfo, catalogProducts } from "../catalog";
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
 * Наполняется импортёрами (scripts/build-catalog-*.mjs), которые пишут снапшот
 * на диск. Читается он лениво, поэтому обновлённый каталог подхватывается без
 * перезапуска приложения.
 */

const PAGE = 18;
/**
 * Сколько карточек просматривается, чтобы набрать страницу. Из окна берутся
 * лучшие по вкусу, остальные в этом круге уже не покажутся: при каталоге в сто
 * тысяч позиций потеря не имеет значения, а подбор становится заметным.
 */
const WINDOW = PAGE * 3;

/**
 * Категории приходят из разных источников разными слагами: «furniture» и
 * «Furniture» — это одно и то же. Схлопываем их по русскому ярлыку, он же
 * становится значением фильтра. Одиночные категории в список не берём: выбирать
 * из них нечего, а строку фильтров они забивают.
 */
function buildCategoryFacets(all: Product[]): string[] {
  const counts = new Map<string, number>();
  for (const p of all) {
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
  const byId = new Map(catalogProducts().map((p) => [p.id, p]));
  const out: Record<string, number> = {};
  for (const id of ids) {
    const base = id.replace(/-r\d+$/, "");
    const price = byId.get(base)?.price;
    if (price !== undefined) out[id] = price;
  }
  return out;
}

/**
 * Диапазон цен и список категорий для панели фильтров. Пересчитываются вместе
 * со снапшотом: прежние константы вычислялись один раз при запуске и после
 * обновления каталога показывали бы вчерашние категории.
 */
export function facets(): { categories: string[]; maxPrice: number; currency: string } {
  const all = catalogProducts();
  return {
    categories: buildCategoryFacets(all),
    maxPrice: all.reduce((max, p) => (p.price !== undefined && p.price > max ? p.price : max), 0),
    currency: all[0]?.currency ?? "RUB",
  };
}

export function meta(): { kind: string; generatedAt: string | null; total: number; categories: string[]; source: string } {
  const info = catalogInfo();
  return { ...info, categories: catalogCategories() };
}

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

/** Название источника по снапшоту: витрина на AliExpress не должна называться
 *  «своей базой» — человек видит этот ярлык в настройках. */
const SNAPSHOT_LABEL: Record<string, string> = { ae: "AliExpress", etsy: "Etsy", global: "Открытый каталог" };

export const localProvider: Provider = {
  id: "local",
  get label() {
    return SNAPSHOT_LABEL[catalogInfo().kind] ?? "Своя база";
  },
  get note() {
    return `${catalogProducts().length} карточек в снапшоте. Работает всегда, без внешних API.`;
  },
  needsToken: false,
  ready: () => catalogProducts().length > 0,

  async page({ query, cursor, seed, filters, hint }: PageArgs): Promise<ProviderPage> {
    const { offset, round } = decodeCursor(cursor);

    // Снимок берём один раз на запрос: между строками он может смениться, если
    // импортёр как раз дописал новый.
    const all = catalogProducts();
    if (!all.length) return { products: [], cursor: encodeCursor(0, round), looped: false };

    // Отвергнутое исключаем жёстко: свайп влево — это «больше не показывай».
    const banned = new Set(hint?.exclude ?? []);

    /** Отбор подряд с места остановки: что набрали и докуда дошли. */
    const collect = (list: Product[], from: number, strict: boolean) => {
      const found: Product[] = [];
      let i = from;
      for (; i < list.length && found.length < WINDOW; i++) {
        const p = list[i];
        if (banned.has(p.id)) continue;
        if (strict && query && !match(p, query)) continue;
        if (strict && !passes(p, filters)) continue;
        found.push(p);
      }
      return { found, next: i };
    };

    /**
     * Порядок карточек фиксирован на круг: он зависит только от снапшота и
     * зерна сессии.
     *
     * Раньше витрина сортировалась по вкусу целиком, а страница вырезалась из
     * неё по смещению. Но вкус меняется с каждым свайпом, и список под
     * смещением уезжал: часть карточек приезжала по второму разу, часть
     * пропускалась навсегда. Клиент повторы отбрасывал, страница приходила
     * пустой, и человек смотрел на «подбираем следующие карточки» столько,
     * сколько нужно было запросов, чтобы случайно набрать непоказанное.
     *
     * Теперь смещение идёт по неизменному порядку, а вкус решает только то,
     * какие карточки из очередного окна показать первыми.
     */
    // Круг текущий, а если он пройден до конца — следующий: каталог конечен,
    // а лента не должна заканчиваться. Суффикс круга не даёт идентификаторам
    // совпасть с уже показанными.
    for (let r = round, from = offset, pass = 0; pass < 2; pass++, r += 1, from = 0) {
      const ordered = shuffle(all, seed + r * 104729);
      let { found, next } = collect(ordered, from, true);
      // Под запрос и фильтры не подошло ничего: показываем витрину целиком,
      // а не пустой экран.
      if (!found.length) ({ found, next } = collect(ordered, from, false));
      if (!found.length) continue;

      // Вкус решает порядок внутри окна. Небольшой шум не даёт ленте застыть.
      const rnd = mulberry32(seed + r * 104729 + from);
      const best = hint
        ? found
            .map((p) => ({ p, s: score(p, hint, rnd) }))
            .sort((a, b) => b.s - a.s)
            .slice(0, PAGE)
            .map((x) => x.p)
        : found.slice(0, PAGE);

      const products = r > 0 ? best.map((p) => ({ ...p, id: `${p.id}-r${r}` })) : best;
      return { products, cursor: encodeCursor(next, r), looped: r !== round };
    }

    // Сюда попадаем, только если исключено вообще всё, что есть в каталоге.
    return { products: [], cursor: encodeCursor(0, round), looped: false };
  },
};
