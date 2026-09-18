"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import ActionBar from "@/components/ActionBar";
import FilterSheet from "@/components/FilterSheet";
import Onboarding from "@/components/Onboarding";
import ProductSheet from "@/components/ProductSheet";
import SettingsSheet from "@/components/SettingsSheet";
import SwipeCard from "@/components/SwipeCard";
import TopBar from "@/components/TopBar";
import { IconCart, IconHeart, IconSearch, IconSliders } from "@/components/Icons";
import { toast } from "@/components/Toast";
import { loadNextPage } from "@/lib/feed";
import { DAILY_GOAL, useHydrated, useStore, type Decision } from "@/lib/store";
import type { Product } from "@/lib/types";

const VISIBLE = 3;
/** За сколько карточек до конца просить следующую страницу. */
const PREFETCH_AT = 8;
/** Сколько первых свайпов подсвечивать зоны тапа. */
const HINT_SWIPES = 3;

type Facets = { categories: string[]; maxPrice: number; currency: string };

function haptic(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
}

export default function DeckPage() {
  const hydrated = useHydrated();
  const deck = useStore((s) => s.deck);
  const index = useStore((s) => s.index);
  const stats = useStore((s) => s.stats);
  const rates = useStore((s) => s.rates);
  const cursor = useStore((s) => s.cursor);
  const filters = useStore((s) => s.filters);
  const query = useStore((s) => s.query);
  const onboarded = useStore((s) => s.onboarded);
  const providerLabel = useStore((s) => s.providerLabel);
  const historyLen = useStore((s) => s.history.length);
  const decide = useStore((s) => s.decide);
  const undo = useStore((s) => s.undo);
  const setFilters = useStore((s) => s.setFilters);
  const finishOnboarding = useStore((s) => s.finishOnboarding);

  const [exitDir, setExitDir] = useState<Decision>("like");
  const [sheet, setSheet] = useState<Product | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [facets, setFacets] = useState<Facets>({ categories: [], maxPrice: 0, currency: "RUB" });
  const [catalogSize, setCatalogSize] = useState(0);
  const [burst, setBurst] = useState<{ id: number; kind: Decision } | null>(null);
  const loadingRef = useRef(false);
  const goalCelebrated = useRef(false);

  const visible = deck.slice(index, index + VISIBLE);
  const remaining = Math.max(0, deck.length - index);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d: { facets?: Facets; catalog?: { total: number } }) => {
        if (d.facets) setFacets(d.facets);
        if (d.catalog) setCatalogSize(d.catalog.total);
      })
      .catch(() => undefined);
  }, []);

  const onDecide = useCallback(
    (d: Decision) => {
      setExitDir(d);
      const product = decide(d);
      if (!product) return;
      if (d === "like") {
        haptic(12);
        setBurst({ id: Date.now(), kind: d });
      } else if (d === "super") {
        haptic([10, 40, 20]);
        setBurst({ id: Date.now(), kind: d });
        toast("В корзине", "like");
      } else {
        haptic(6);
      }
    },
    [decide],
  );

  useEffect(() => {
    if (!burst) return;
    const timer = setTimeout(() => setBurst(null), 620);
    return () => clearTimeout(timer);
  }, [burst]);

  // Клавиатура: на десктопе свайпать так же быстро, как пальцем.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (sheet || filtersOpen || settingsOpen || !onboarded) return;
      if (e.key === "ArrowRight") onDecide("like");
      else if (e.key === "ArrowLeft") onDecide("dislike");
      else if (e.key === "ArrowUp") onDecide("super");
      else if (e.key === "Backspace") undo();
      else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        const top = deck[index];
        if (top) setSheet(top);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDecide, undo, sheet, filtersOpen, settingsOpen, onboarded, deck, index]);

  /** Бесконечная лента: запас карточек пополняется заранее. */
  useEffect(() => {
    if (!hydrated || feedError) return;
    if (remaining > PREFETCH_AT) return;
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    loadNextPage()
      .then((res) => {
        if (!res.ok) setFeedError(res.error ?? "Источник не ответил");
      })
      .finally(() => {
        loadingRef.current = false;
        setLoading(false);
      });
  }, [hydrated, remaining, feedError, cursor]);

  useEffect(() => {
    if (stats.daySwipes >= DAILY_GOAL && !goalCelebrated.current) {
      goalCelebrated.current = true;
      toast(`Дневная цель выполнена: ${DAILY_GOAL} карточек`, "like");
      haptic([16, 60, 16]);
    }
  }, [stats.daySwipes]);

  const toggleCategory = (c: string) => {
    const list = filters.categories ?? [];
    setFilters({ ...filters, categories: list.includes(c) ? list.filter((x) => x !== c) : [...list, c] });
    setFeedError(null);
  };

  /** Поиск и фильтры применяются вместе: обе правки пересобирают ленту разом. */
  const applyFilters = (f: typeof filters, q: string) => {
    useStore.setState({ query: q });
    setFilters(f);
    setFeedError(null);
  };

  if (!hydrated) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-[var(--color-line)] border-t-[var(--color-brand)]" />
      </div>
    );
  }

  const extraFilters = (filters.maxPrice !== undefined ? 1 : 0) + (filters.onlyDiscount ? 1 : 0) + (query ? 1 : 0);

  return (
    <div className="flex flex-1 flex-col">
      <AnimatePresence>
        {!onboarded && <Onboarding onDone={finishOnboarding} />}
      </AnimatePresence>

      <TopBar
        daySwipes={stats.daySwipes}
        streak={stats.streak}
        categories={facets.categories}
        active={filters.categories ?? []}
        extraFilters={extraFilters}
        onToggleCategory={toggleCategory}
        onOpenFilters={() => setFiltersOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div className="relative flex-1 px-4 pb-1 pt-3">
        <div className="absolute inset-x-4 bottom-1 top-3">
          <AnimatePresence custom={exitDir} initial={false}>
            {visible
              .map((product, i) => ({ product, i }))
              .reverse()
              .map(({ product, i }) => (
                <SwipeCard
                  key={product.id}
                  product={product}
                  rates={rates}
                  depth={i}
                  showHint={i === 0 && stats.swipes < HINT_SWIPES}
                  onDecide={onDecide}
                  onOpen={() => setSheet(product)}
                />
              ))}
          </AnimatePresence>

          {remaining === 0 && (
            <Interlude
              loading={loading}
              error={feedError}
              hasFilters={extraFilters + (filters.categories?.length ?? 0) > 0}
              onRetry={() => {
                loadingRef.current = false;
                setFeedError(null);
              }}
              onClearFilters={() => applyFilters({}, "")}
            />
          )}

          {/* Короткий отклик на решение: заметнее тоста, не мешает следующему свайпу */}
          <AnimatePresence>
            {burst && (
              <motion.div
                key={burst.id}
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1.15, opacity: 1 }}
                exit={{ scale: 1.5, opacity: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 18 }}
                className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center"
              >
                <span
                  className="flex h-24 w-24 items-center justify-center rounded-full"
                  style={{
                    background: burst.kind === "super" ? "var(--color-brand)" : "var(--color-like)",
                    boxShadow: "0 12px 40px rgba(0,0,0,.28)",
                  }}
                >
                  {burst.kind === "super" ? (
                    <IconCart className="h-11 w-11 text-white" />
                  ) : (
                    <IconHeart className="h-11 w-11 text-white" />
                  )}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <ActionBar onDecide={onDecide} onUndo={undo} canUndo={historyLen > 0} disabled={remaining === 0} />

      <ProductSheet product={sheet} onClose={() => setSheet(null)} />

      <FilterSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        categories={facets.categories}
        maxPrice={facets.maxPrice}
        currency={facets.currency}
        value={filters}
        query={query}
        onApply={applyFilters}
      />

      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        sourceLabel={providerLabel}
        catalogSize={catalogSize}
        baseCurrency={facets.currency}
      />
    </div>
  );
}

/** Пауза между страницами ленты: либо ждём загрузку, либо объясняем сбой. */
function Interlude({
  loading,
  error,
  hasFilters,
  onRetry,
  onClearFilters,
}: {
  loading: boolean;
  error: string | null;
  hasFilters: boolean;
  onRetry: () => void;
  onClearFilters: () => void;
}) {
  return (
    <div className="card-shadow absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-[var(--radius-card)] bg-[var(--color-surface)] px-8 text-center">
      {loading || !error ? (
        <>
          <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-[var(--color-line)] border-t-[var(--color-brand)]" />
          <p className="text-[14px] text-[var(--color-muted)]">Подбираем следующие карточки…</p>
        </>
      ) : (
        <>
          <div>
            <h2 className="font-display text-[19px] font-bold">Лента прервалась</h2>
            <p className="mt-1.5 text-[14px] leading-snug text-[var(--color-muted)]">{error}</p>
          </div>
          <div className="flex w-full flex-col gap-2">
            <button
              type="button"
              onClick={onRetry}
              className="brand-gradient rounded-2xl py-3.5 text-[15px] font-bold text-white"
            >
              Попробовать снова
            </button>
            {hasFilters && (
              <button
                type="button"
                onClick={onClearFilters}
                className="flex items-center justify-center gap-2 rounded-2xl bg-[var(--color-surface-2)] py-3.5 text-[15px] font-semibold"
              >
                <IconSliders className="h-5 w-5" /> Сбросить фильтры
              </button>
            )}
            <Link
              href="/likes"
              className="flex items-center justify-center gap-2 rounded-2xl bg-[var(--color-surface-2)] py-3.5 text-[15px] font-semibold"
            >
              <IconHeart className="h-5 w-5 text-[var(--color-like)]" /> Смотреть избранное
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
