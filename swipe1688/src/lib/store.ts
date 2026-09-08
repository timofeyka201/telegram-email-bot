"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { DEFAULT_RATES } from "./money";
import type { Product } from "./types";

export type CartItem = { product: Product; qty: number; sku?: string };
export type Decision = "like" | "dislike" | "super";
type HistoryEntry = { product: Product; decision: Decision };

export type Stats = {
  swipes: number;
  likes: number;
  streak: number;
  bestStreak: number;
  day: string;
  daySwipes: number;
};

const today = () => new Date().toISOString().slice(0, 10);
const emptyStats = (): Stats => ({ swipes: 0, likes: 0, streak: 0, bestStreak: 0, day: today(), daySwipes: 0 });

export const DAILY_GOAL = 20;

/** Лента бесконечна, поэтому просмотренные карточки periodically выбрасываем. */
const KEEP_BEHIND = 12;
const TRIM_AT = 60;

type State = {
  deck: Product[];
  index: number;
  liked: Product[];
  seen: string[];
  cart: CartItem[];
  history: HistoryEntry[];
  stats: Stats;
  rates: Record<string, number>;
  query: string;
  provider: string | null;
  providerLabel: string;
  cursor: string | null;
  seed: number;

  startFeed: (opts: { provider: string | null; query: string }) => void;
  appendPage: (products: Product[], cursor: string, provider: string, providerLabel: string) => void;
  decide: (decision: Decision) => Product | undefined;
  undo: () => void;
  unlike: (id: string) => void;
  like: (product: Product) => void;
  addToCart: (product: Product, sku?: string) => void;
  setQty: (id: string, qty: number) => void;
  removeFromCart: (id: string) => void;
  clearCart: () => void;
  setRate: (currency: string, rate: number) => void;
  resetAll: () => void;
};

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      deck: [],
      index: 0,
      liked: [],
      seen: [],
      cart: [],
      history: [],
      stats: emptyStats(),
      rates: { ...DEFAULT_RATES },
      query: "",
      provider: null,
      providerLabel: "",
      cursor: null,
      seed: Math.floor(Math.random() * 1e9),

      startFeed: ({ provider, query }) =>
        set({
          deck: [],
          index: 0,
          history: [],
          cursor: null,
          provider,
          query,
          seed: Math.floor(Math.random() * 1e9),
        }),

      appendPage: (products, cursor, provider, providerLabel) =>
        set((s) => {
          const known = new Set([...s.deck.map((p) => p.id), ...s.seen]);
          const fresh = products.filter((p) => !known.has(p.id));
          return { deck: [...s.deck, ...fresh], cursor, provider, providerLabel };
        }),

      decide: (decision) => {
        const s = get();
        const product = s.deck[s.index];
        if (!product) return undefined;

        const stats = { ...s.stats };
        if (stats.day !== today()) {
          stats.day = today();
          stats.daySwipes = 0;
        }
        stats.swipes += 1;
        stats.daySwipes += 1;
        if (decision === "dislike") {
          stats.streak = 0;
        } else {
          stats.likes += 1;
          stats.streak += 1;
          stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
        }

        const liked =
          decision === "dislike" || s.liked.some((p) => p.id === product.id)
            ? s.liked
            : [product, ...s.liked];

        const cart =
          decision === "super" && !s.cart.some((c) => c.product.id === product.id)
            ? [{ product, qty: product.minOrder && product.minOrder > 1 ? product.minOrder : 1 }, ...s.cart]
            : s.cart;

        let deck = s.deck;
        let index = s.index + 1;
        // Колода растёт бесконечно — подрезаем хвост, чтобы не раздувать память
        // и localStorage. Отмена свайпа опирается на history, а не на колоду.
        if (index > TRIM_AT) {
          const cut = index - KEEP_BEHIND;
          deck = s.deck.slice(cut);
          index -= cut;
        }

        set({
          deck,
          index,
          liked,
          cart,
          seen: [product.id, ...s.seen].slice(0, 800),
          history: [{ product, decision }, ...s.history].slice(0, 30),
          stats,
        });
        return product;
      },

      undo: () =>
        set((s) => {
          const [last, ...rest] = s.history;
          if (!last || s.index === 0) return s;
          const stats = { ...s.stats };
          stats.swipes = Math.max(0, stats.swipes - 1);
          stats.daySwipes = Math.max(0, stats.daySwipes - 1);
          if (last.decision !== "dislike") {
            stats.likes = Math.max(0, stats.likes - 1);
            stats.streak = Math.max(0, stats.streak - 1);
          }
          return {
            index: s.index - 1,
            history: rest,
            liked: last.decision === "dislike" ? s.liked : s.liked.filter((p) => p.id !== last.product.id),
            cart: last.decision === "super" ? s.cart.filter((c) => c.product.id !== last.product.id) : s.cart,
            seen: s.seen.filter((id) => id !== last.product.id),
            stats,
          };
        }),

      unlike: (id) => set((s) => ({ liked: s.liked.filter((p) => p.id !== id) })),

      like: (product) =>
        set((s) => (s.liked.some((p) => p.id === product.id) ? s : { liked: [product, ...s.liked] })),

      addToCart: (product, sku) =>
        set((s) => {
          if (s.cart.some((c) => c.product.id === product.id)) return s;
          const qty = product.minOrder && product.minOrder > 1 ? product.minOrder : 1;
          return { cart: [{ product, qty, sku }, ...s.cart] };
        }),

      setQty: (id, qty) =>
        set((s) => ({
          cart: s.cart.map((c) => (c.product.id === id ? { ...c, qty: Math.max(1, Math.min(9999, qty)) } : c)),
        })),

      removeFromCart: (id) => set((s) => ({ cart: s.cart.filter((c) => c.product.id !== id) })),

      clearCart: () => set({ cart: [] }),

      setRate: (currency, rate) =>
        set((s) => ({ rates: { ...s.rates, [currency]: rate > 0 ? rate : 1 } })),

      resetAll: () =>
        set({
          deck: [],
          index: 0,
          liked: [],
          seen: [],
          cart: [],
          history: [],
          stats: emptyStats(),
          query: "",
          cursor: null,
        }),
    }),
    {
      name: "swipe1688",
      version: 2,
      storage: createJSONStorage(() => localStorage),
      migrate: () => undefined as unknown as State, // схема изменилась — начинаем с чистого листа
      partialize: (s) => ({
        // Колода уже ограничена подрезкой в decide, сохраняем её целиком:
        // иначе index разъезжается с содержимым при перезагрузке.
        deck: s.deck,
        index: s.index,
        liked: s.liked.slice(0, 200),
        seen: s.seen.slice(0, 400),
        cart: s.cart,
        stats: s.stats,
        rates: s.rates,
        query: s.query,
        provider: s.provider,
        providerLabel: s.providerLabel,
        cursor: s.cursor,
        seed: s.seed,
      }),
    },
  ),
);

/**
 * До гидратации из localStorage разметка на сервере и на клиенте отличается,
 * поэтому компоненты со счётчиками ждут этот флаг вместо мигания пустотой.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (useStore.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return useStore.persist.onFinishHydration(() => setHydrated(true));
  }, []);
  return hydrated;
}

/** Цена за штуку с учётом оптового порога под текущее количество. */
export function unitPrice(item: CartItem): number {
  const { product, qty } = item;
  if (product.tiers.length) {
    const match = [...product.tiers].reverse().find((t) => qty >= t.from);
    if (match) return match.price;
  }
  return product.price ?? 0;
}

/** Итог по валютам: товары из разных источников считаются раздельно. */
export function cartTotals(cart: CartItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const item of cart) {
    const cur = item.product.currency || "CNY";
    totals[cur] = (totals[cur] ?? 0) + unitPrice(item) * item.qty;
  }
  return totals;
}
