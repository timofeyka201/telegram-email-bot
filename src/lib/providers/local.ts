import catalog from "../../../data/catalog.json";
import type { Product } from "../types";
import { decodeCursor, encodeCursor, shuffle, type PageArgs, type Provider, type ProviderPage } from "./types";

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

export const localProvider: Provider = {
  id: "local",
  label: "Своя база",
  note: `${ALL.length} карточек в репозитории. Работает всегда, без внешних API.`,
  needsToken: false,
  ready: () => ALL.length > 0,

  async page({ query, cursor, seed }: PageArgs): Promise<ProviderPage> {
    const { offset, round } = decodeCursor(cursor);

    const pool = query ? ALL.filter((p) => match(p, query)) : ALL;
    const source = pool.length ? pool : ALL;

    // Порядок свой на каждый круг и на каждую сессию — лента не повторяется.
    const ordered = shuffle(source, seed + round * 104729);
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
