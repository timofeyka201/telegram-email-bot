import { DEMO_PRODUCTS } from "../demo";
import type { Product } from "../types";
import { decodeCursor, encodeCursor, shuffle, type PageArgs, type Provider, type ProviderPage } from "./types";

const PAGE = 6;

/**
 * Офлайн-подборка: работает без сети вообще. Нужна как запасной вариант,
 * когда внешние источники недоступны — приложение всё равно открывается.
 */
export const demoProvider: Provider = {
  id: "demo",
  label: "Офлайн-подборка",
  note: "12 карточек внутри приложения. Работает без сети.",
  needsToken: false,
  ready: () => true,

  async page({ query, cursor, seed }: PageArgs): Promise<ProviderPage> {
    const { offset, round } = decodeCursor(cursor);
    const pool = query
      ? DEMO_PRODUCTS.filter((p) => p.title.toLowerCase().includes(query.toLowerCase()))
      : DEMO_PRODUCTS;
    const source = pool.length ? pool : DEMO_PRODUCTS;

    const ordered = shuffle(source, seed + round * 104729);
    const slice = ordered.slice(offset, offset + PAGE);
    const wrapped = offset + PAGE >= ordered.length;

    const products: Product[] = slice.map((p) => (round > 0 ? { ...p, id: `${p.id}-r${round}` } : p));
    return {
      products,
      cursor: wrapped ? encodeCursor(0, round + 1) : encodeCursor(offset + PAGE, round),
      looped: wrapped,
    };
  },
};
