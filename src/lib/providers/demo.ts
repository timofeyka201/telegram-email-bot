import { DEMO_PRODUCTS } from "../demo";
import { searchCatalog } from "../search";
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

    // По запросу отдаём только найденное. Раньше, не найдя ничего, подборка
    // возвращала всё подряд — и человек видел дюжину случайных карточек там,
    // где ждал результатов поиска.
    if (query.trim()) {
      const { ranked, total, loose } = searchCatalog(DEMO_PRODUCTS, query);
      const slice = ranked.slice(offset, offset + PAGE);
      return { products: slice, cursor: encodeCursor(offset + PAGE, round), looped: false, total, loose };
    }

    const ordered = shuffle(DEMO_PRODUCTS, seed + round * 104729);
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
