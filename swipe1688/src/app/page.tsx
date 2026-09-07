"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import ActionBar from "@/components/ActionBar";
import ParsePanel from "@/components/ParsePanel";
import ProductSheet from "@/components/ProductSheet";
import SwipeCard from "@/components/SwipeCard";
import TopBar from "@/components/TopBar";
import { IconHeart, IconSearch, IconSpark, IconX } from "@/components/Icons";
import { toast } from "@/components/Toast";
import { DAILY_GOAL, useHydrated, useStore, type Decision } from "@/lib/store";
import type { ParseResult, Product } from "@/lib/types";

const VISIBLE = 3;

function haptic(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
}

export default function DeckPage() {
  const hydrated = useHydrated();
  const deck = useStore((s) => s.deck);
  const index = useStore((s) => s.index);
  const stats = useStore((s) => s.stats);
  const rate = useStore((s) => s.rate);
  const lastQuery = useStore((s) => s.lastQuery);
  const historyLen = useStore((s) => s.history.length);
  const decide = useStore((s) => s.decide);
  const undo = useStore((s) => s.undo);
  const appendDeck = useStore((s) => s.appendDeck);

  const [exitDir, setExitDir] = useState<Decision>("like");
  const [sheet, setSheet] = useState<Product | null>(null);
  const [parseOpen, setParseOpen] = useState(false);
  const [refilling, setRefilling] = useState(false);
  const pageRef = useRef(1);
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

  // Клавиатура: стрелки и пробел — чтобы на десктопе было так же быстро, как пальцем.
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

  // Дозагрузка: лента не должна заканчиваться под пальцем.
  useEffect(() => {
    if (!hydrated || refilling || !deck.length || remaining > 4) return;
    const isDemo = deck[deck.length - 1]?.source === "demo";
    const isUrlQuery = /1688\.com|^\s*\d{6,}\s*$/m.test(lastQuery);

    if (isDemo) {
      import("@/lib/demo").then(({ demoDeck }) => {
        const stamp = Date.now();
        appendDeck(demoDeck(12).map((p) => ({ ...p, id: `${p.id}-r${stamp}` })));
      });
      return;
    }
    if (!lastQuery || isUrlQuery) return;

    setRefilling(true);
    pageRef.current += 1;
    fetch("/api/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "search", query: lastQuery, page: pageRef.current }),
    })
      .then((r) => r.json())
      .then((d: ParseResult & { error?: string }) => {
        if (d.products?.length) appendDeck(d.products);
      })
      .catch(() => undefined)
      .finally(() => setRefilling(false));
  }, [hydrated, remaining, deck, lastQuery, appendDeck, refilling]);

  // Достижение дневной цели — маленький повод вернуться завтра.
  useEffect(() => {
    if (stats.daySwipes >= DAILY_GOAL && !goalCelebrated.current) {
      goalCelebrated.current = true;
      toast(`Дневная цель выполнена: ${DAILY_GOAL} карточек 🎉`, "like");
      haptic([16, 60, 16]);
    }
  }, [stats.daySwipes]);

  if (!hydrated) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-[var(--color-line)] border-t-[var(--color-accent)]" />
      </div>
    );
  }

  if (!deck.length) {
    return (
      <div className="flex-1">
        <ParsePanel />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <TopBar daySwipes={stats.daySwipes} streak={stats.streak} remaining={remaining} onOpenParse={() => setParseOpen(true)} />

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
                  rate={rate}
                  depth={i}
                  onDecide={onDecide}
                  onOpen={() => setSheet(product)}
                />
              ))}
          </AnimatePresence>

          {remaining === 0 && <EndOfDeck onNew={() => setParseOpen(true)} likes={stats.likes} swipes={stats.swipes} />}
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
            className="fixed inset-0 z-50 bg-black/40"
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
              <ParsePanel compact onDone={() => setParseOpen(false)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function EndOfDeck({ onNew, likes, swipes }: { onNew: () => void; likes: number; swipes: number }) {
  return (
    <div className="card-shadow pop absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-[var(--radius-card)] bg-[var(--color-surface)] px-8 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#fff2e8]">
        <IconSpark className="h-8 w-8 text-[var(--color-accent)]" />
      </span>
      <div>
        <h2 className="text-[19px] font-bold">Карточки закончились</h2>
        <p className="mt-1.5 text-[14px] leading-snug text-[var(--color-muted)]">
          Просмотрено {swipes} · понравилось {likes}. Запустите новый парсинг — лента соберётся заново.
        </p>
      </div>
      <div className="flex w-full flex-col gap-2">
        <button
          type="button"
          onClick={onNew}
          className="flex items-center justify-center gap-2 rounded-2xl bg-[var(--color-accent)] py-3.5 text-[15px] font-semibold text-white"
        >
          <IconSearch className="h-5 w-5" /> Новый поиск
        </button>
        <Link
          href="/likes"
          className="flex items-center justify-center gap-2 rounded-2xl bg-[var(--color-surface-2)] py-3.5 text-[15px] font-semibold"
        >
          <IconHeart className="h-5 w-5 text-[var(--color-like)]" /> Смотреть избранное
        </Link>
      </div>
    </div>
  );
}
