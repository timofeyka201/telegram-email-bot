"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import Img from "./Img";
import { IconCart, IconExternal, IconHeart, IconStar, IconX } from "./Icons";
import { toast } from "./Toast";
import { useStore } from "@/lib/store";
import type { Product } from "@/lib/types";
import { compact, formatCny, formatRub, plural, priceLabel } from "@/lib/money";

type Tab = "desc" | "specs" | "reviews";

export default function ProductSheet({ product, onClose }: { product: Product | null; onClose: () => void }) {
  return (
    <AnimatePresence>
      {product && <Sheet key={product.id} product={product} onClose={onClose} />}
    </AnimatePresence>
  );
}

function Sheet({ product, onClose }: { product: Product; onClose: () => void }) {
  const rate = useStore((s) => s.rate);
  const cart = useStore((s) => s.cart);
  const liked = useStore((s) => s.liked);
  const addToCart = useStore((s) => s.addToCart);
  const unlike = useStore((s) => s.unlike);

  const [full, setFull] = useState<Product>(product);
  const [enriching, setEnriching] = useState(false);
  const [tab, setTab] = useState<Tab>("desc");

  const inCart = cart.some((c) => c.product.id === full.id);
  const isLiked = liked.some((p) => p.id === full.id);

  // Выдача поиска обычно приходит без описания и отзывов — дотягиваем по ссылке.
  useEffect(() => {
    const thin = !product.description && product.reviews.length === 0 && product.attributes.length === 0;
    if (!thin || product.source === "demo") return;
    let alive = true;
    setEnriching(true);
    fetch(`/api/item?url=${encodeURIComponent(product.url)}`)
      .then((r) => r.json())
      .then((d: { product?: Product }) => {
        if (alive && d.product) setFull({ ...d.product, id: product.id });
      })
      .catch(() => undefined)
      .finally(() => alive && setEnriching(false));
    return () => {
      alive = false;
    };
  }, [product]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const tabs: [Tab, string][] = [
    ["desc", "Описание"],
    ["specs", `Характеристики${full.attributes.length ? ` ${full.attributes.length}` : ""}`],
    ["reviews", `Отзывы${full.reviews.length ? ` ${full.reviews.length}` : ""}`],
  ];

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", stiffness: 340, damping: 36 }}
      className="fixed inset-0 z-50 mx-auto flex max-w-[480px] flex-col bg-[var(--color-bg)]"
    >
      <div className="flex-1 overflow-y-auto overscroll-contain pb-28">
        <div className="relative">
          <Gallery images={full.images} title={full.title} />
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="absolute left-3 top-3 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur"
          >
            <IconX className="h-5 w-5" />
          </button>
        </div>

        <section className="bg-[var(--color-surface)] px-4 pb-5 pt-4">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="text-[28px] font-bold leading-none">{formatRub(full.price, rate)}</span>
            {full.priceMax !== undefined && (
              <span className="text-[15px] text-[var(--color-muted)]">до {formatRub(full.priceMax, rate)}</span>
            )}
            <span className="text-[13px] text-[var(--color-muted)]">{priceLabel(full.price, full.priceMax)}</span>
          </div>
          <h1 className="mt-2 text-[17px] font-semibold leading-snug">{full.title}</h1>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-[var(--color-muted)]">
            {full.rating !== undefined && (
              <span className="flex items-center gap-1 font-semibold text-[var(--color-ink)]">
                <IconStar className="h-4 w-4 text-[var(--color-amber)]" />
                {full.rating.toFixed(1)}
              </span>
            )}
            {full.soldCount !== undefined && (
              <span>
                {compact(full.soldCount)} {plural(full.soldCount, "заказ", "заказа", "заказов")}
              </span>
            )}
            {full.minOrder !== undefined && full.minOrder > 1 && <span>от {full.minOrder} шт.</span>}
          </div>

          {full.tiers.length > 1 && (
            <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--color-line)]">
              <div className="bg-[var(--color-surface-2)] px-3.5 py-2 text-[12px] font-semibold text-[var(--color-muted)]">
                Оптовые цены
              </div>
              {full.tiers.map((t, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between border-t border-[var(--color-line)] px-3.5 py-2.5 text-[14px]"
                >
                  <span className="text-[var(--color-muted)]">
                    {t.to ? `${t.from}–${t.to} шт.` : `от ${t.from} шт.`}
                  </span>
                  <span className="font-semibold">
                    {formatRub(t.price, rate)}
                    <span className="ml-1.5 text-[12px] font-normal text-[var(--color-muted)]">{formatCny(t.price)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}

          {full.skus.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-[13px] font-semibold text-[var(--color-muted)]">Варианты</p>
              <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
                {full.skus.slice(0, 20).map((sku) => (
                  <span
                    key={sku.id}
                    className="whitespace-nowrap rounded-xl border border-[var(--color-line)] px-3 py-1.5 text-[13px]"
                  >
                    {sku.name}
                    {sku.price !== undefined && (
                      <span className="ml-1.5 text-[var(--color-muted)]">{formatCny(sku.price)}</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>

        {full.seller?.name && (
          <section className="mt-2 bg-[var(--color-surface)] px-4 py-4">
            <p className="text-[13px] font-semibold text-[var(--color-muted)]">Поставщик</p>
            <p className="mt-1 text-[15px] font-semibold">{full.seller.name}</p>
            <p className="mt-0.5 text-[13px] text-[var(--color-muted)]">
              {[full.seller.location, full.seller.years ? `${full.seller.years} лет на площадке` : null]
                .filter(Boolean)
                .join(" · ") || "—"}
            </p>
          </section>
        )}

        <section className="mt-2 bg-[var(--color-surface)]">
          <div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-[var(--color-line)] px-2">
            {tabs.map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`relative whitespace-nowrap px-3 py-3 text-[14px] font-semibold transition-colors ${
                  tab === id ? "text-[var(--color-ink)]" : "text-[var(--color-muted)]"
                }`}
              >
                {label}
                {tab === id && (
                  <motion.span
                    layoutId="tab-underline"
                    className="absolute inset-x-2 bottom-0 h-[3px] rounded-full bg-[var(--color-accent)]"
                  />
                )}
              </button>
            ))}
          </div>

          <div className="px-4 py-4">
            {enriching && <div className="skeleton h-24 w-full rounded-xl" />}

            {!enriching && tab === "desc" && (
              <p className="whitespace-pre-line text-[14px] leading-relaxed text-[var(--color-ink)]">
                {full.description || "Продавец не добавил текстовое описание."}
              </p>
            )}

            {!enriching && tab === "specs" && (
              <div className="divide-y divide-[var(--color-line)]">
                {full.attributes.length === 0 && (
                  <p className="text-[14px] text-[var(--color-muted)]">Характеристики не указаны.</p>
                )}
                {full.attributes.map((a, i) => (
                  <div key={i} className="flex gap-3 py-2.5 text-[14px]">
                    <span className="w-1/2 shrink-0 text-[var(--color-muted)]">{a.name}</span>
                    <span className="font-medium">{a.value}</span>
                  </div>
                ))}
              </div>
            )}

            {!enriching && tab === "reviews" && <Reviews product={full} />}
          </div>
        </section>

        <a
          href={full.url}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-2 flex items-center justify-between bg-[var(--color-surface)] px-4 py-4 text-[14px] font-medium"
        >
          Открыть карточку на 1688
          <IconExternal className="h-4.5 w-4.5 text-[var(--color-muted)]" />
        </a>
      </div>

      <div className="absolute inset-x-0 bottom-0 flex items-center gap-2.5 border-t border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => {
            if (isLiked) {
              unlike(full.id);
              toast("Убрали из избранного");
            } else {
              useStore.setState((s) => ({ liked: [full, ...s.liked] }));
              toast("Добавили в избранное", "like");
            }
          }}
          aria-label={isLiked ? "Убрать из избранного" : "В избранное"}
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border transition-colors ${
            isLiked
              ? "border-transparent bg-[#e8f8f0] text-[var(--color-like)]"
              : "border-[var(--color-line)] text-[var(--color-muted)]"
          }`}
        >
          <IconHeart className="h-6 w-6" />
        </button>
        <button
          type="button"
          disabled={inCart}
          onClick={() => {
            addToCart(full);
            toast("Добавили в корзину", "like");
          }}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--color-accent)] py-3.5 text-[15px] font-semibold text-white disabled:bg-[var(--color-surface-2)] disabled:text-[var(--color-muted)]"
        >
          <IconCart className="h-5 w-5" />
          {inCart ? "Уже в корзине" : "В корзину"}
        </button>
      </div>
    </motion.div>
  );
}

function Gallery({ images, title }: { images: string[]; title: string }) {
  const [index, setIndex] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const list = images.length ? images : [""];

  function onScroll() {
    const el = ref.current;
    if (!el) return;
    setIndex(Math.round(el.scrollLeft / el.clientWidth));
  }

  return (
    <div className="relative bg-[var(--color-surface)]">
      <div
        ref={ref}
        onScroll={onScroll}
        className="no-scrollbar flex aspect-[4/5] w-full snap-x snap-mandatory overflow-x-auto"
      >
        {list.map((src, i) => (
          <Img
            key={i}
            src={src}
            alt={`${title} — фото ${i + 1}`}
            eager={i === 0}
            className="h-full w-full shrink-0 snap-center"
            fallbackLabel={title.slice(0, 60)}
          />
        ))}
      </div>
      {list.length > 1 && (
        <>
          <span className="absolute right-3 top-3 rounded-full bg-black/45 px-2.5 py-1 text-[12px] font-semibold text-white backdrop-blur">
            {index + 1} / {list.length}
          </span>
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-3">
            {list.map((src, i) => (
              <button
                key={i}
                type="button"
                onClick={() => ref.current?.scrollTo({ left: i * ref.current.clientWidth, behavior: "smooth" })}
                className={`h-14 w-14 shrink-0 overflow-hidden rounded-xl border-2 transition-colors ${
                  i === index ? "border-[var(--color-accent)]" : "border-transparent"
                }`}
              >
                <Img src={src} alt="" className="h-full w-full" fallbackLabel="" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Reviews({ product }: { product: Product }) {
  const [expanded, setExpanded] = useState(false);
  const list = useMemo(() => (expanded ? product.reviews : product.reviews.slice(0, 5)), [expanded, product.reviews]);

  if (!product.reviews.length) {
    return (
      <p className="text-[14px] text-[var(--color-muted)]">
        {product.reviewsCount ? `Отзывов: ${product.reviewsCount}, но текстов парсер не отдал.` : "Отзывов пока нет."}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {list.map((r) => (
        <div key={r.id} className="border-b border-[var(--color-line)] pb-4 last:border-0 last:pb-0">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-[13px] font-semibold">
              {(r.author ?? "?").slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold">{r.author ?? "Покупатель"}</p>
              {r.rating !== undefined && (
                <span className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <IconStar
                      key={n}
                      className={`h-3 w-3 ${n <= Math.round(r.rating!) ? "text-[var(--color-amber)]" : "text-[var(--color-line)]"}`}
                    />
                  ))}
                </span>
              )}
            </div>
            {r.date && <span className="ml-auto text-[12px] text-[var(--color-muted)]">{r.date}</span>}
          </div>
          <p className="mt-2 text-[14px] leading-relaxed">{r.text}</p>
          {r.images.length > 0 && (
            <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto">
              {r.images.map((src, i) => (
                <Img key={i} src={src} alt="" className="h-20 w-20 shrink-0 rounded-xl" fallbackLabel="" />
              ))}
            </div>
          )}
        </div>
      ))}
      {!expanded && product.reviews.length > 5 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full rounded-xl bg-[var(--color-surface-2)] py-2.5 text-[14px] font-semibold"
        >
          Показать все {product.reviews.length}
        </button>
      )}
    </div>
  );
}
