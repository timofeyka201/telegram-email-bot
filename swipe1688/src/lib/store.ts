"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Product } from "./types";

export type CartItem = { product: Product; qty: number; sku?: string };
export type Decision = "like" | "dislike" | "super";
type HistoryEntry = { product: Product; decision: Decision };

export type Stats = {
  swipes: number;
  likes: number;
  streak: number;
  bestStreak: number;
  /** ISO-дата дня, за который считаем дневную цель */
  day: string;
  daySwipes: number;
};

const today = () => new Date().toISOString().slice(0, 10);

const emptyStats = (): Stats => ({ swipes: 0, likes: 0, streak: 0, bestStreak: 0, day: today(), daySwipes: 0 });

export const DAILY_GOAL = 20;

type State = {
  deck: Product[];
  index: number;
  liked: Product[];
  seen: string[];
  cart: CartItem[];
  history: HistoryEntry[];
  stats: Stats;
  rate: number;
  lastQuery: string;

  setDeck: (products: Product[], query?: string) => void;
  appendDeck: (products: Product[]) => void;
  decide: (decision: Decision) => Product | undefined;
  undo: () => void;
  unlike: (id: string) => void;
  addToCart: (product: Product, sku?: string) => void;
  setQty: (id: string, qty: number) => void;
  removeFromCart: (id: string) => void;
  clearCart: () => void;
  setRate: (rate: number) => void;
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
      rate: 12.4,
      lastQuery: "",

      setDeck: (products, query) =>
        set(() => ({ deck: products, index: 0, history: [], lastQuery: query ?? "" })),

      appendDeck: (products) =>
        set((s) => {
          const known = new Set(s.deck.map((p) => p.id));
          const fresh = products.filter((p) => !known.has(p.id));
          return { deck: [...s.deck, ...fresh] };
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

        set({
          index: s.index + 1,
          liked,
          cart,
          seen: [product.id, ...s.seen].slice(0, 500),
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

      setRate: (rate) => set({ rate: rate > 0 ? rate : 1 }),

      resetAll: () =>
        set({ deck: [], index: 0, liked: [], seen: [], cart: [], history: [], stats: emptyStats(), lastQuery: "" }),
    }),
    {
      name: "swipe1688",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        deck: s.deck.slice(0, 60),
        index: s.index,
        liked: s.liked.slice(0, 200),
        seen: s.seen,
        cart: s.cart,
        stats: s.stats,
        rate: s.rate,
        lastQuery: s.lastQuery,
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

/** Итог корзины в юанях с учётом оптовых порогов. */
export function cartTotalCny(cart: CartItem[]): number {
  return cart.reduce((sum, item) => sum + unitPrice(item) * item.qty, 0);
}

export function unitPrice(item: CartItem): number {
  const { product, qty } = item;
  if (product.tiers.length) {
    const match = [...product.tiers].reverse().find((t) => qty >= t.from);
    if (match) return match.price;
  }
  return product.price ?? 0;
}
