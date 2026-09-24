"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { DEFAULT_RATES, toRub } from "./money";
import { emptySizes, type SizeProfile } from "./sizes";
import { emptyTaste, learn, learnReason, type RejectReason, type Taste } from "./taste";
import type { Filters } from "./providers/types";
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

/** Слежение за ценой: что стоил товар в момент, когда его отложили. */
export type PriceWatch = { price: number; currency: string; since: string };
export type Account = { id: string; email: string; name?: string; createdAt: string; emailVerified?: boolean };

/** Что уезжает в облако при входе: всё личное, но не служебное. */
export type SyncedProfile = {
  liked: Product[];
  wishlist: Product[];
  cart: CartItem[];
  taste: Taste;
  sizes: SizeProfile;
  watch: Record<string, PriceWatch>;
  rejected: string[];
  stats: Stats;
  rates: Record<string, number>;
  tasted: boolean;
  updatedAt: number;
};
export type PriceDrop = { id: string; title: string; image?: string; was: number; now: number; currency: string };

const today = () => new Date().toISOString().slice(0, 10);
const emptyStats = (): Stats => ({ swipes: 0, likes: 0, streak: 0, bestStreak: 0, day: today(), daySwipes: 0 });

export const DAILY_GOAL = 20;

/**
 * Как часто спрашивать причину отказа. Вопрос должен быть редким: он полезен
 * рекомендациям, но раздражает, если всплывает часто.
 */
export const ASK_REASON_EVERY = 200;

/** Лента бесконечна, поэтому просмотренные карточки periodically выбрасываем. */
const KEEP_BEHIND = 12;
const TRIM_AT = 60;

type State = {
  deck: Product[];
  index: number;
  liked: Product[];
  wishlist: Product[];
  seen: string[];
  /** товары, отвергнутые явно: показывать их снова нельзя */
  rejected: string[];
  cart: CartItem[];
  history: HistoryEntry[];
  stats: Stats;
  rates: Record<string, number>;
  query: string;
  filters: Filters;
  theme: "system" | "light" | "dark";
  onboarded: boolean;
  /** тест вкусов пройден (или пропущен) */
  tasted: boolean;
  taste: Taste;
  sizes: SizeProfile;
  watch: Record<string, PriceWatch>;
  wishTotal: number | null;
  drops: PriceDrop[];
  dropsSeen: boolean;
  dislikesSinceAsk: number;
  pendingReason: Product | null;
  account: Account | null;
  /** когда личные данные менялись последний раз — для разрешения конфликтов */
  updatedAt: number;
  provider: string | null;
  providerLabel: string;
  cursor: string | null;
  seed: number;

  setAccount: (account: Account | null) => void;
  exportProfile: () => SyncedProfile;
  importProfile: (profile: SyncedProfile) => void;
  startFeed: (opts: { provider: string | null; query: string }) => void;
  appendPage: (products: Product[], cursor: string, provider: string, providerLabel: string) => void;
  decide: (decision: Decision) => Product | undefined;
  undo: () => void;
  unlike: (id: string) => void;
  like: (product: Product) => void;
  toggleWish: (product: Product) => void;
  /** Вишлист приехал с сервера: локальная копия должна совпасть с ним целиком. */
  setWishlist: (products: Product[]) => void;
  /**
   * Сколько желаний в серверном списке. Локальная копия хранит только карточки
   * из ленты, поэтому считать значок в меню по ней — значит показывать
   * заниженное число тому, кто добавил своих желаний.
   */
  setWishTotal: (total: number | null) => void;
  addToCart: (product: Product, sku?: string) => void;
  setQty: (id: string, qty: number) => void;
  removeFromCart: (id: string) => void;
  clearCart: () => void;
  setRate: (currency: string, rate: number) => void;
  setFilters: (filters: Filters) => void;
  setTheme: (theme: "system" | "light" | "dark") => void;
  finishOnboarding: () => void;
  finishTaste: (picked: string[], budget?: number) => void;
  answerReason: (reason: RejectReason | null) => void;
  setSizes: (sizes: SizeProfile) => void;
  applyPrices: (current: Record<string, number>) => void;
  dismissDrops: () => void;
  resetAll: () => void;
};

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      deck: [],
      index: 0,
      liked: [],
      wishlist: [],
      seen: [],
      rejected: [],
      cart: [],
      history: [],
      stats: emptyStats(),
      rates: { ...DEFAULT_RATES },
      query: "",
      filters: {},
      theme: "system",
      onboarded: false,
      tasted: false,
      taste: emptyTaste(),
      sizes: emptySizes(),
      watch: {},
      wishTotal: null,
      drops: [],
      dropsSeen: true,
      dislikesSinceAsk: 0,
      pendingReason: null,
      account: null,
      updatedAt: 0,
      provider: null,
      providerLabel: "",
      cursor: null,
      seed: Math.floor(Math.random() * 1e9),

      // Выход должен уносить и счётчик: чужое число желаний в меню — мелочь, но вранье.
      setAccount: (account) => set(account ? { account } : { account: null, wishTotal: null }),

      exportProfile: () => {
        const s = get();
        return {
          liked: s.liked,
          wishlist: s.wishlist,
          cart: s.cart,
          taste: s.taste,
          sizes: s.sizes,
          watch: s.watch,
          rejected: s.rejected,
          stats: s.stats,
          rates: s.rates,
          tasted: s.tasted,
          updatedAt: s.updatedAt,
        };
      },

      /**
       * Данные из облака заменяют локальные целиком. Слияние списков «по уму»
       * выглядит заманчиво, но приводит к воскрешению удалённого, поэтому
       * побеждает более свежая запись — решение принимается до вызова.
       */
      importProfile: (profile) =>
        set({
          liked: profile.liked ?? [],
          wishlist: profile.wishlist ?? [],
          cart: profile.cart ?? [],
          taste: profile.taste ?? emptyTaste(),
          sizes: profile.sizes ?? emptySizes(),
          watch: profile.watch ?? {},
          rejected: profile.rejected ?? [],
          stats: profile.stats ?? emptyStats(),
          rates: profile.rates ?? { ...DEFAULT_RATES },
          tasted: profile.tasted ?? false,
          updatedAt: profile.updatedAt ?? Date.now(),
          // Лента пересобирается: чужие отказы и вкусы меняют выдачу.
          deck: [],
          index: 0,
          cursor: null,
          history: [],
        }),

      startFeed: ({ provider, query }) =>
        set({ deck: [], index: 0, history: [], cursor: null, provider, query, seed: Math.floor(Math.random() * 1e9) }),

      appendPage: (products, cursor, provider, providerLabel) =>
        set((s) => {
          const known = new Set([...s.deck.map((p) => p.id), ...s.seen, ...s.rejected]);
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
          decision === "dislike" || s.liked.some((p) => p.id === product.id) ? s.liked : [product, ...s.liked];

        const cart =
          decision === "super" && !s.cart.some((c) => c.product.id === product.id)
            ? [{ product, qty: product.minOrder && product.minOrder > 1 ? product.minOrder : 1 }, ...s.cart]
            : s.cart;

        let deck = s.deck;
        let index = s.index + 1;
        if (index > TRIM_AT) {
          const cut = index - KEEP_BEHIND;
          deck = s.deck.slice(cut);
          index -= cut;
        }

        // Отказ — сигнал сильнее лайка: товар больше не показываем никогда.
        const rejected = decision === "dislike" ? [product.id, ...s.rejected].slice(0, 2000) : s.rejected;

        let dislikesSinceAsk = s.dislikesSinceAsk;
        let pendingReason = s.pendingReason;
        if (decision === "dislike") {
          dislikesSinceAsk += 1;
          if (dislikesSinceAsk >= ASK_REASON_EVERY) {
            dislikesSinceAsk = 0;
            pendingReason = product;
          }
        }

        set({
          updatedAt: Date.now(),
          deck,
          index,
          liked,
          cart,
          rejected,
          dislikesSinceAsk,
          pendingReason,
          seen: [product.id, ...s.seen].slice(0, 800),
          history: [{ product, decision }, ...s.history].slice(0, 30),
          stats,
          taste: learn(s.taste, product, decision),
          watch: decision === "dislike" ? s.watch : rememberPrice(s.watch, product),
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
            rejected: s.rejected.filter((id) => id !== last.product.id),
            // Отменённый отказ не должен учиться как отказ.
            taste: learn(s.taste, last.product, last.decision === "dislike" ? "like" : "dislike"),
            stats,
          };
        }),

      unlike: (id) => set((s) => ({ liked: s.liked.filter((p) => p.id !== id), updatedAt: Date.now() })),

      like: (product) =>
        set((s) =>
          s.liked.some((p) => p.id === product.id)
            ? s
            : { liked: [product, ...s.liked], watch: rememberPrice(s.watch, product), updatedAt: Date.now() },
        ),

      toggleWish: (product) =>
        set((s) => {
          const has = s.wishlist.some((p) => p.id === product.id);
          return has
            ? { wishlist: s.wishlist.filter((p) => p.id !== product.id), updatedAt: Date.now() }
            : { wishlist: [product, ...s.wishlist], watch: rememberPrice(s.watch, product), updatedAt: Date.now() };
        }),

      setWishTotal: (total) => set({ wishTotal: total }),

      setWishlist: (products) =>
        set((s) => {
          const same =
            s.wishlist.length === products.length && s.wishlist.every((p, i) => p.id === products[i].id);
          // Без этой проверки страница, обновляющая копию после каждой загрузки,
          // толкала бы синхронизацию профиля по кругу.
          if (same) return s;
          let watch = s.watch;
          for (const p of products) watch = rememberPrice(watch, p);
          return { wishlist: products, watch, updatedAt: Date.now() };
        }),

      addToCart: (product, sku) =>
        set((s) => {
          if (s.cart.some((c) => c.product.id === product.id)) return s;
          const qty = product.minOrder && product.minOrder > 1 ? product.minOrder : 1;
          return { cart: [{ product, qty, sku }, ...s.cart], watch: rememberPrice(s.watch, product), updatedAt: Date.now() };
        }),

      setQty: (id, qty) =>
        set((s) => ({
          cart: s.cart.map((c) => (c.product.id === id ? { ...c, qty: Math.max(1, Math.min(9999, qty)) } : c)),
          updatedAt: Date.now(),
        })),

      removeFromCart: (id) => set((s) => ({ cart: s.cart.filter((c) => c.product.id !== id), updatedAt: Date.now() })),

      clearCart: () => set({ cart: [], updatedAt: Date.now() }),

      setRate: (currency, rate) => set((s) => ({ rates: { ...s.rates, [currency]: rate > 0 ? rate : 1 } })),

      setFilters: (filters) =>
        set((s) => ({
          filters,
          deck: [],
          index: 0,
          history: [],
          cursor: null,
          seed: Math.floor(Math.random() * 1e9),
          query: s.query,
        })),

      setTheme: (theme) => {
        if (typeof document !== "undefined") {
          if (theme === "system") delete document.documentElement.dataset.theme;
          else document.documentElement.dataset.theme = theme;
          try {
            if (theme === "system") localStorage.removeItem("swiper-theme");
            else localStorage.setItem("swiper-theme", theme);
          } catch {
            /* приватный режим — тема просто не переживёт перезагрузку */
          }
        }
        set({ theme });
      },

      finishOnboarding: () => set({ onboarded: true }),

      finishTaste: (picked, budget) =>
        set((s) => ({
          tasted: true,
          updatedAt: Date.now(),
          taste: { ...s.taste, picked, budget },
          // Ответы теста должны сразу отразиться на ленте.
          deck: [],
          index: 0,
          cursor: null,
          history: [],
        })),

      answerReason: (reason) =>
        set((s) => {
          const product = s.pendingReason;
          if (!product || !reason) return { pendingReason: null };
          const priceRub = toRub(product.price, product.currency, s.rates);
          return { pendingReason: null, taste: learnReason(s.taste, product, reason, priceRub), updatedAt: Date.now() };
        }),

      setSizes: (sizes) => set({ sizes, updatedAt: Date.now() }),

      /** Сверяет текущие цены с запомненными и собирает список подешевевших. */
      applyPrices: (current) =>
        set((s) => {
          const drops: PriceDrop[] = [];
          const watch = { ...s.watch };
          const known = [...s.liked, ...s.wishlist, ...s.cart.map((c) => c.product)];

          for (const [id, now] of Object.entries(current)) {
            const snap = watch[id];
            if (!snap || now >= snap.price) {
              // Цена выросла или впервые увидена — запоминаем как новую точку отсчёта.
              if (snap && now > snap.price) watch[id] = { ...snap, price: now };
              continue;
            }
            const product = known.find((p) => p.id === id);
            drops.push({
              id,
              title: product?.title ?? "Товар",
              image: product?.images[0],
              was: snap.price,
              now,
              currency: snap.currency,
            });
          }
          if (!drops.length) return { watch };
          return { watch, drops, dropsSeen: false };
        }),

      dismissDrops: () =>
        set((s) => {
          // После просмотра точкой отсчёта становится новая, уже сниженная цена.
          const watch = { ...s.watch };
          for (const d of s.drops) {
            if (watch[d.id]) watch[d.id] = { ...watch[d.id], price: d.now };
          }
          return { drops: [], dropsSeen: true, watch };
        }),

      resetAll: () =>
        set({
          deck: [],
          index: 0,
          liked: [],
          wishlist: [],
          seen: [],
          rejected: [],
          cart: [],
          history: [],
          stats: emptyStats(),
          query: "",
          filters: {},
          cursor: null,
          taste: emptyTaste(),
          watch: {},
          drops: [],
          dropsSeen: true,
          dislikesSinceAsk: 0,
        }),
    }),
    {
      name: "swipe1688",
      version: 3,
      storage: createJSONStorage(() => localStorage),
      migrate: () => undefined as unknown as State,
      partialize: (s) => ({
        deck: s.deck,
        index: s.index,
        liked: s.liked.slice(0, 200),
        wishlist: s.wishlist.slice(0, 200),
        seen: s.seen.slice(0, 400),
        rejected: s.rejected.slice(0, 2000),
        cart: s.cart,
        stats: s.stats,
        rates: s.rates,
        query: s.query,
        filters: s.filters,
        theme: s.theme,
        onboarded: s.onboarded,
        tasted: s.tasted,
        taste: s.taste,
        sizes: s.sizes,
        watch: s.watch,
        wishTotal: s.wishTotal,
        // Счётчик обязан пережить перезагрузку, иначе «раз в 200» не накопится.
        dislikesSinceAsk: s.dislikesSinceAsk,
        account: s.account,
        updatedAt: s.updatedAt,
        provider: s.provider,
        providerLabel: s.providerLabel,
        cursor: s.cursor,
        seed: s.seed,
      }),
    },
  ),
);

/** Цену запоминаем один раз — при первом попадании товара в списки. */
function rememberPrice(watch: Record<string, PriceWatch>, product: Product): Record<string, PriceWatch> {
  if (product.price === undefined || watch[product.id]) return watch;
  return {
    ...watch,
    [product.id]: { price: product.price, currency: product.currency, since: today() },
  };
}

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
