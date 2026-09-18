"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Img from "@/components/Img";
import ProductSheet from "@/components/ProductSheet";
import PriceDrops from "@/components/PriceDrops";
import { IconBookmark, IconCart, IconHeart, IconTrash } from "@/components/Icons";
import { toast } from "@/components/Toast";
import { categoryLabel } from "@/lib/categories";
import { useHydrated, useStore } from "@/lib/store";
import { formatNative, formatRub, needsConversion, plural, toRub } from "@/lib/money";
import type { Product } from "@/lib/types";

type Sort = "new" | "cheap" | "expensive" | "rating";

const SORTS: [Sort, string][] = [
  ["new", "Сначала новые"],
  ["cheap", "Сначала дешёвые"],
  ["expensive", "Сначала дорогие"],
  ["rating", "По рейтингу"],
];

export default function LikesPage() {
  const hydrated = useHydrated();
  const liked = useStore((s) => s.liked);
  const wishlist = useStore((s) => s.wishlist);
  const toggleWish = useStore((s) => s.toggleWish);
  const drops = useStore((s) => s.drops);
  const cart = useStore((s) => s.cart);
  const rates = useStore((s) => s.rates);
  const unlike = useStore((s) => s.unlike);
  const addToCart = useStore((s) => s.addToCart);
  const [sheet, setSheet] = useState<Product | null>(null);
  const [sort, setSort] = useState<Sort>("new");
  const [tab, setTab] = useState<"liked" | "wish">("liked");
  const [category, setCategory] = useState<string | null>(null);

  // Вишлист — отдельная полка: туда кладут осознанно и следят за ценой.
  const source = tab === "liked" ? liked : wishlist;

  const categories = useMemo(
    () => [...new Set(source.map((p) => p.category).filter(Boolean) as string[])],
    [source],
  );

  const shown = useMemo(() => {
    const list = category ? source.filter((p) => p.category === category) : [...source];
    const rub = (p: Product) => toRub(p.price, p.currency, rates) ?? 0;
    if (sort === "cheap") return list.sort((a, b) => rub(a) - rub(b));
    if (sort === "expensive") return list.sort((a, b) => rub(b) - rub(a));
    if (sort === "rating") return list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    return list;
  }, [source, category, sort, rates]);

  if (!hydrated) return <div className="flex-1" />;

  const notInCart = shown.filter((p) => !cart.some((c) => c.product.id === p.id));

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-30 min-w-0 border-b border-[var(--color-line)] bg-[var(--color-surface)]/92 backdrop-blur-md">
        <div className="flex items-baseline justify-between px-4 pb-2 pt-3">
          <h1 className="font-display text-[20px] font-bold">Избранное</h1>
          <span className="tnum text-[13px] text-[var(--color-muted)]">
            {source.length} {plural(source.length, "товар", "товара", "товаров")}
          </span>
        </div>

        <div className="mx-4 mb-2 flex rounded-full bg-[var(--color-surface-2)] p-1">
          {(
            [
              ["liked", "Понравилось", liked.length],
              ["wish", "Вишлист", wishlist.length],
            ] as const
          ).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTab(id);
                setCategory(null);
              }}
              aria-pressed={tab === id}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-[13px] font-bold transition-colors ${
                tab === id ? "bg-[var(--color-surface)] text-[var(--color-ink)] soft-shadow" : "text-[var(--color-muted)]"
              }`}
            >
              {label}
              {count > 0 && <span className="tnum opacity-60">{count}</span>}
            </button>
          ))}
        </div>

        {source.length > 0 && (
          <div className="no-scrollbar flex w-full min-w-0 items-center gap-1.5 overflow-x-auto px-4 pb-2">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              aria-label="Сортировка"
              className="shrink-0 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-1.5 text-[13px] font-semibold text-[var(--color-ink-soft)] outline-none"
            >
              {SORTS.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setCategory(null)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-[13px] font-medium ${
                category === null
                  ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)] text-[var(--color-brand)]"
                  : "border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-soft)]"
              }`}
            >
              Все
            </button>
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(category === c ? null : c)}
                className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-[13px] font-medium ${
                  category === c
                    ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)] text-[var(--color-brand)]"
                    : "border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-soft)]"
                }`}
              >
                {categoryLabel(c)}
              </button>
            ))}
          </div>
        )}
      </header>

      {drops.length > 0 && <PriceDrops drops={drops} />}

      {source.length === 0 ? (
        <Empty kind={tab} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 p-4 pb-28">
            <AnimatePresence initial={false}>
              {shown.map((p) => {
                const inCart = cart.some((c) => c.product.id === p.id);
                const discount =
                  p.priceMax !== undefined && p.price !== undefined && p.priceMax > p.price
                    ? Math.round((1 - p.price / p.priceMax) * 100)
                    : 0;
                return (
                  <motion.div
                    key={p.id}
                    layout
                    initial={{ opacity: 0, scale: 0.94 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    className="soft-shadow flex flex-col overflow-hidden rounded-3xl bg-[var(--color-surface)]"
                  >
                    <button type="button" onClick={() => setSheet(p)} className="relative block text-left">
                      <Img
                        src={p.images[0]}
                        alt={p.title}
                        className="aspect-square w-full"
                        fallbackLabel={p.title.slice(0, 40)}
                      />
                      {discount >= 10 && (
                        <span className="absolute left-2 top-2 rounded-full bg-[var(--color-nope)] px-2 py-0.5 text-[10px] font-extrabold text-white">
                          −{discount}%
                        </span>
                      )}
                    </button>
                    <div className="flex flex-1 flex-col px-3 pb-2 pt-2">
                      <p className="tnum font-display text-[16px] font-bold leading-none">
                        {formatRub(p.price, p.currency, rates)}
                      </p>
                      {needsConversion(p.currency) && (
                        <p className="tnum mt-0.5 text-[11px] text-[var(--color-muted)]">
                          {formatNative(p.price, p.currency)}
                        </p>
                      )}
                      <p className="mt-1.5 line-clamp-2 min-h-[32px] text-[12px] leading-tight text-[var(--color-ink-soft)]">
                        {p.title}
                      </p>
                    </div>
                    <div className="flex gap-1.5 px-3 pb-3">
                      <button
                        type="button"
                        disabled={inCart}
                        onClick={() => {
                          addToCart(p);
                          toast("В корзине", "like");
                        }}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--color-brand)] py-2 text-[12px] font-bold text-white disabled:bg-[var(--color-surface-2)] disabled:text-[var(--color-muted)]"
                      >
                        <IconCart className="h-4 w-4" />
                        {inCart ? "В корзине" : "В корзину"}
                      </button>
                      <button
                        type="button"
                        aria-label={tab === "liked" ? "Убрать из избранного" : "Убрать из вишлиста"}
                        onClick={() => {
                          if (tab === "liked") unlike(p.id);
                          else toggleWish(p);
                          toast("Убрали");
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

          {notInCart.length > 1 && (
            <div className="fixed inset-x-0 bottom-[68px] z-30 mx-auto max-w-[480px] px-4">
              <button
                type="button"
                onClick={() => {
                  notInCart.forEach((p) => addToCart(p));
                  toast(`${notInCart.length} ${plural(notInCart.length, "товар", "товара", "товаров")} в корзине`, "like");
                }}
                className="brand-gradient pop-shadow flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-bold text-white"
              >
                <IconCart className="h-5 w-5" />
                Всё в корзину · {notInCart.length}
              </button>
            </div>
          )}
        </>
      )}

      <ProductSheet product={sheet} onClose={() => setSheet(null)} />
    </div>
  );
}

function Empty({ kind }: { kind: "liked" | "wish" }) {
  const wish = kind === "wish";
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-10 text-center">
      <span
        className={`flex items-center justify-center rounded-full p-5 ${
          wish ? "bg-[var(--color-brand-soft)]" : "bg-[var(--color-like-soft)]"
        }`}
      >
        {wish ? (
          <IconBookmark className="h-8 w-8 text-[var(--color-brand)]" />
        ) : (
          <IconHeart className="h-8 w-8 text-[var(--color-like)]" />
        )}
      </span>
      <div>
        <h2 className="font-display text-[18px] font-bold">{wish ? "Вишлист пуст" : "Пока пусто"}</h2>
        <p className="mt-1.5 text-[14px] leading-snug text-[var(--color-muted)]">
          {wish
            ? "Откройте товар и нажмите закладку — будем следить за его ценой и скажем, когда подешевеет."
            : "Свайпайте карточки вправо — понравившееся будет собираться здесь."}
        </p>
      </div>
      <Link href="/" className="brand-gradient rounded-2xl px-6 py-3 text-[15px] font-bold text-white">
        В ленту
      </Link>
    </div>
  );
}
