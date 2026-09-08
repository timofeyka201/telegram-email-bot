import { hasToken, search } from "../bhapi";
import type { Product } from "../types";
import { decodeCursor, encodeCursor, type PageArgs, type Provider, type ProviderPage } from "./types";

/**
 * Парсер 1688 по токену. Единственный источник, где лента действительно
 * бесконечна: страницы выдачи идут одна за другой, пока площадка их отдаёт.
 */
export const bhapiProvider: Provider = {
  id: "bhapi",
  label: "1688 по токену",
  note: "Живой парсинг маркетплейса. Нужен BHAPI_TOKEN в .env.local.",
  needsToken: true,
  ready: () => hasToken(),

  async page({ query, cursor, seed }: PageArgs): Promise<ProviderPage> {
    const { offset, round } = decodeCursor(cursor);
    const pageNo = offset + 1;
    const term = query || "оптом";

    const { products } = await search(term, pageNo);
    if (!products.length) {
      // Выдача кончилась — заходим на новый круг с первой страницы.
      if (pageNo === 1) return { products: [], cursor: encodeCursor(0, round), looped: false };
      return { products: [], cursor: encodeCursor(0, round + 1), looped: true };
    }

    const tagged: Product[] = round > 0 ? products.map((p) => ({ ...p, id: `${p.id}-r${round}` })) : products;
    void seed;
    return { products: tagged, cursor: encodeCursor(offset + 1, round), looped: false };
  },
};
