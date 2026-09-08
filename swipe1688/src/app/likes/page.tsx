"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Img from "@/components/Img";
import ProductSheet from "@/components/ProductSheet";
import { IconCart, IconHeart, IconTrash } from "@/components/Icons";
import { toast } from "@/components/Toast";
import { useHydrated, useStore } from "@/lib/store";
import { formatNative, formatRub, plural } from "@/lib/money";
import type { Product } from "@/lib/types";

export default function LikesPage() {
  const hydrated = useHydrated();
  const liked = useStore((s) => s.liked);
  const cart = useStore((s) => s.cart);
  const rates = useStore((s) => s.rates);
  const unlike = useStore((s) => s.unlike);
  const addToCart = useStore((s) => s.addToCart);
  const [sheet, setSheet] = useState<Product | null>(null);

  if (!hydrated) return <div className="flex-1" />;

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[var(--color-line)] bg-[var(--color-surface)]/95 px-4 py-3 backdrop-blur">
        <h1 className="text-[17px] font-bold">Избранное</h1>
        <span className="text-[13px] text-[var(--color-muted)]">
          {liked.length} {plural(liked.length, "товар", "товара", "товаров")}
        </span>
      </header>

      {liked.length === 0 ? (
        <Empty />
      ) : (
        <div className="grid grid-cols-2 gap-3 p-4">
          <AnimatePresence initial={false}>
            {liked.map((p) => {
              const inCart = cart.some((c) => c.product.id === p.id);
              return (
                <motion.div
                  key={p.id}
                  layout
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  className="soft-shadow overflow-hidden rounded-2xl bg-[var(--color-surface)]"
                >
                  <button type="button" onClick={() => setSheet(p)} className="block w-full text-left">
                    <Img src={p.images[0]} alt={p.title} className="aspect-square w-full" fallbackLabel={p.title.slice(0, 40)} />
                    <div className="px-2.5 pb-2 pt-2">
                      <p className="text-[15px] font-bold leading-none">{formatRub(p.price, p.currency, rates)}</p>
                      <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">{formatNative(p.price, p.currency)}</p>
                      <p className="mt-1 line-clamp-2 min-h-[32px] text-[12px] leading-tight text-[var(--color-ink)]">
                        {p.title}
                      </p>
                    </div>
                  </button>
                  <div className="flex gap-1.5 px-2.5 pb-2.5">
                    <button
                      type="button"
                      disabled={inCart}
                      onClick={() => {
                        addToCart(p);
                        toast("Добавили в корзину", "like");
                      }}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--color-accent)] py-2 text-[12px] font-semibold text-white disabled:bg-[var(--color-surface-2)] disabled:text-[var(--color-muted)]"
                    >
                      <IconCart className="h-4 w-4" />
                      {inCart ? "В корзине" : "В корзину"}
                    </button>
                    <button
                      type="button"
                      aria-label="Убрать из избранного"
                      onClick={() => {
                        unlike(p.id);
                        toast("Убрали из избранного");
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--color-surface-2)] text-[var(--color-muted)]"
                    >
                      <IconTrash className="h-4 w-4" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      <ProductSheet product={sheet} onClose={() => setSheet(null)} />
    </div>
  );
}

function Empty() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-10 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#e8f8f0]">
        <IconHeart className="h-8 w-8 text-[var(--color-like)]" />
      </span>
      <div>
        <h2 className="text-[17px] font-bold">Пока пусто</h2>
        <p className="mt-1.5 text-[14px] leading-snug text-[var(--color-muted)]">
          Свайпайте карточки вправо — понравившееся будет собираться здесь.
        </p>
      </div>
      <Link href="/" className="rounded-2xl bg-[var(--color-accent)] px-6 py-3 text-[15px] font-semibold text-white">
        В ленту
      </Link>
    </div>
  );
}
