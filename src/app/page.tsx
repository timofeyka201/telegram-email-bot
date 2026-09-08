"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import ActionBar from "@/components/ActionBar";
import ParsePanel from "@/components/ParsePanel";
import ProductSheet from "@/components/ProductSheet";
import SwipeCard from "@/components/SwipeCard";
import TopBar from "@/components/TopBar";
import { IconHeart, IconSearch, IconX } from "@/components/Icons";
import { toast } from "@/components/Toast";
import { loadNextPage } from "@/lib/feed";
import { DAILY_GOAL, useHydrated, useStore, type Decision } from "@/lib/store";
import type { Product } from "@/lib/types";

const VISIBLE = 3;
/** За сколько карточек до конца просить следующую страницу. */
const PREFETCH_AT = 8;

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
  const providerLabel = useStore((s) => s.providerLabel);
  const historyLen = useStore((s) => s.history.length);
  const decide = useStore((s) => s.decide);
  const undo = useStore((s) => s.undo);

  const [exitDir, setExitDir] = useState<Decision>("like");
  const [sheet, setSheet] = useState<Product | null>(null);
  const [parseOpen, setParseOpen] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const goalCelebrated = useRef(false);

  const visible = deck.slice(index, index + VISIBLE);
  const remaining = Math.max(0, deck.length - index);

  const onDecide = useCallback(
    (d: Decision) => {
      setExitDir(d);
      const product = decide(d);
      if (!product) return;
      if (d === "like") {
        haptic(12);
        toast("В избранном", "like");
      } else if (d === "super") {
        haptic([10, 40, 20]);
        toast("Сразу в корзину", "like");
      } else {
        haptic(6);
      }
    },
    [decide],
  );

  // Клавиатура: на десктопе свайпать так же быстро, как пальцем.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (sheet || parseOpen) return;
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
  }, [onDecide, undo, sheet, parseOpen, deck, index]);

  /**
   * Бесконечная лента: как только запас карточек проседает, тянем следующую
   * страницу. Курсор хранится в сторе, поэтому докрутка переживает перезагрузку.
   */
  useEffect(() => {
    if (!hydrated || feedError) return;
    if (remaining > PREFETCH_AT) return;
    // Флаг «уже грузим» держим в ref, а не в state: иначе он попадает в
    // зависимости эффекта и cleanup успевает погасить завершение запроса.
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
      toast(`Дневная цель выполнена: ${DAILY_GOAL} карточек 🎉`, "like");
      haptic([16, 60, 16]);
    }
  }, [stats.daySwipes]);

  const retry = () => {
    loadingRef.current = false;
    setFeedError(null);
  };

  if (!hydrated) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-[var(--color-line)] border-t-[var(--color-accent)]" />
      </div>
    );
  }

  // Лента ещё ни разу не наполнилась и что-то сломалось — показываем подбор.
  if (!deck.length && feedError) {
    return (
      <div className="flex-1">
        <div className="mx-5 mt-5 rounded-2xl bg-[#fff1f0] px-4 py-3 text-[13px] leading-snug text-[#c2352a]">
          {feedError}
        </div>
        <ParsePanel />
      </div>
    );
  }

  if (!deck.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-[var(--color-line)] border-t-[var(--color-accent)]" />
        <p className="text-[14px] text-[var(--color-muted)]">Собираем ленту…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <TopBar
        daySwipes={stats.daySwipes}
        streak={stats.streak}
        remaining={remaining}
        sourceLabel={providerLabel}
        onOpenParse={() => setParseOpen(true)}
      />

      <div className="relative flex-1 px-4 pb-2 pt-3">
        <div className="absolute inset-x-4 bottom-2 top-3">
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
                  onDecide={onDecide}
                  onOpen={() => setSheet(product)}
                />
              ))}
          </AnimatePresence>

          {remaining === 0 && <Interlude loading={loading} error={feedError} onRetry={retry} onNew={() => setParseOpen(true)} />}
        </div>
      </div>

      <ActionBar onDecide={onDecide} onUndo={undo} canUndo={historyLen > 0} disabled={remaining === 0} />

      <ProductSheet product={sheet} onClose={() => setSheet(null)} />

      <AnimatePresence>
        {parseOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 overflow-y-auto bg-black/40"
            onClick={() => setParseOpen(false)}
          >
            <motion.div
              initial={{ y: -24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -24, opacity: 0 }}
              transition={{ type: "spring", stiffness: 360, damping: 34 }}
              onClick={(e) => e.stopPropagation()}
              className="mx-auto max-w-[480px] rounded-b-3xl bg-[var(--color-bg)] px-5 pb-6 pt-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[17px] font-bold">Новая лента</h2>
                <button
                  type="button"
                  onClick={() => setParseOpen(false)}
                  aria-label="Закрыть"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-surface)]"
                >
                  <IconX className="h-4.5 w-4.5" />
                </button>
              </div>
              <ParsePanel
                compact
                onDone={() => {
                  setFeedError(null);
                  setParseOpen(false);
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Пауза между страницами ленты: либо ждём загрузку, либо объясняем сбой. */
function Interlude({
  loading,
  error,
  onRetry,
  onNew,
}: {
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onNew: () => void;
}) {
  return (
    <div className="card-shadow absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-[var(--radius-card)] bg-[var(--color-surface)] px-8 text-center">
      {loading || !error ? (
        <>
          <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-[var(--color-line)] border-t-[var(--color-accent)]" />
          <p className="text-[14px] text-[var(--color-muted)]">Подгружаем следующие карточки…</p>
        </>
      ) : (
        <>
          <div>
            <h2 className="text-[19px] font-bold">Лента прервалась</h2>
            <p className="mt-1.5 text-[14px] leading-snug text-[var(--color-muted)]">{error}</p>
          </div>
          <div className="flex w-full flex-col gap-2">
            <button
              type="button"
              onClick={onRetry}
              className="rounded-2xl bg-[var(--color-accent)] py-3.5 text-[15px] font-semibold text-white"
            >
              Попробовать снова
            </button>
            <button
              type="button"
              onClick={onNew}
              className="flex items-center justify-center gap-2 rounded-2xl bg-[var(--color-surface-2)] py-3.5 text-[15px] font-semibold"
            >
              <IconSearch className="h-5 w-5" /> Сменить источник
            </button>
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
