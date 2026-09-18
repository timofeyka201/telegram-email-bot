"use client";

import { motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { useState } from "react";
import Img from "./Img";
import { IconFlame, IconInfo, IconStar } from "./Icons";
import { categoryLabel } from "@/lib/categories";
import type { Product } from "@/lib/types";
import type { Decision } from "@/lib/store";
import { compact, formatNative, formatRub, needsConversion, plural } from "@/lib/money";

const SWIPE_DISTANCE = 110;
const SWIPE_VELOCITY = 520;
const SUPER_DISTANCE = 130;

type Props = {
  product: Product;
  rates: Record<string, number>;
  /** 0 — верхняя карточка, дальше — те, что в стопке под ней */
  depth: number;
  /** подсветить зоны тапа: нужно только на первых карточках */
  showHint?: boolean;
  onDecide: (d: Decision) => void;
  onOpen: () => void;
};

export default function SwipeCard({ product, rates, depth, showHint, onDecide, onOpen }: Props) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-260, 0, 260], [-14, 0, 14]);
  const likeOpacity = useTransform(x, [24, 130], [0, 1]);
  const nopeOpacity = useTransform(x, [-130, -24], [1, 0]);
  const superOpacity = useTransform(y, [-140, -50], [1, 0]);
  // Лёгкое затемнение фото под штампом делает решение заметнее
  const dim = useTransform([x, y], ([vx, vy]: number[]) =>
    Math.min(0.28, (Math.abs(vx) + Math.max(0, -vy)) / 600),
  );

  const [imgIndex, setImgIndex] = useState(0);
  const images = product.images.length ? product.images : [""];
  const interactive = depth === 0;

  function handleDragEnd(_: unknown, info: PanInfo) {
    const { offset, velocity } = info;
    if (offset.y < -SUPER_DISTANCE && Math.abs(offset.x) < 100) return onDecide("super");
    if (offset.x > SWIPE_DISTANCE || velocity.x > SWIPE_VELOCITY) return onDecide("like");
    if (offset.x < -SWIPE_DISTANCE || velocity.x < -SWIPE_VELOCITY) return onDecide("dislike");
    x.set(0);
    y.set(0);
  }

  /** Тап по краям листает фото, тап по центру открывает карточку. */
  function handleTap(event: MouseEvent | TouchEvent | PointerEvent) {
    const target = event.currentTarget as HTMLElement | null;
    if (!target) return onOpen();
    const rect = target.getBoundingClientRect();
    const point = "clientX" in event ? event.clientX : (event as TouchEvent).changedTouches?.[0]?.clientX;
    if (point === undefined) return onOpen();
    const ratio = (point - rect.left) / rect.width;
    if (images.length > 1 && ratio < 0.28) setImgIndex((i) => (i - 1 + images.length) % images.length);
    else if (images.length > 1 && ratio > 0.72) setImgIndex((i) => (i + 1) % images.length);
    else onOpen();
  }

  const hot = (product.soldCount ?? 0) > 5000 || (product.reviewsCount ?? 0) > 2000;
  const discount =
    product.priceMax !== undefined && product.price !== undefined && product.priceMax > product.price
      ? Math.round((1 - product.price / product.priceMax) * 100)
      : 0;

  const meta = [
    product.soldCount !== undefined
      ? `${compact(product.soldCount)} ${plural(product.soldCount, "заказ", "заказа", "заказов")}`
      : product.reviewsCount
        ? `${compact(product.reviewsCount)} ${plural(product.reviewsCount, "отзыв", "отзыва", "отзывов")}`
        : null,
    product.seller?.location || product.seller?.name,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <motion.div
      className="absolute inset-0 touch-none select-none"
      style={interactive ? { x, y, rotate, zIndex: 10 } : { zIndex: 10 - depth }}
      initial={{ scale: 1 - depth * 0.04, y: depth * 14, opacity: depth > 2 ? 0 : 1 }}
      animate={{ scale: 1 - depth * 0.04, y: depth === 0 ? 0 : depth * 14, opacity: depth > 2 ? 0 : 1 }}
      variants={{
        exit: (custom: Decision) => ({
          x: custom === "like" ? 640 : custom === "dislike" ? -640 : 0,
          y: custom === "super" ? -740 : 40,
          rotate: custom === "like" ? 18 : custom === "dislike" ? -18 : 0,
          opacity: 0,
          transition: { duration: 0.32, ease: "easeOut" },
        }),
      }}
      exit="exit"
      transition={{ type: "spring", stiffness: 320, damping: 34 }}
      drag={interactive}
      dragElastic={0.7}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      onDragEnd={handleDragEnd}
      onTap={interactive ? (e) => handleTap(e) : undefined}
    >
      <div className="card-shadow relative h-full w-full overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-surface)]">
        <Img
          src={images[imgIndex]}
          alt={product.title}
          eager={depth === 0}
          className="absolute inset-0 h-full w-full"
          fallbackLabel={product.title.slice(0, 60)}
        />
        <motion.div className="pointer-events-none absolute inset-0 bg-black" style={{ opacity: dim }} />

        {images.length > 1 && (
          <div className="absolute inset-x-3 top-3 z-20 flex gap-1" aria-hidden>
            {images.slice(0, 10).map((_, i) => (
              <span
                key={i}
                className={`h-[3px] flex-1 rounded-full transition-colors ${i === imgIndex ? "bg-white" : "bg-white/35"}`}
              />
            ))}
          </div>
        )}

        {/* Зоны тапа не видны сами по себе — подсказываем их на первых карточках */}
        {interactive && showHint && images.length > 1 && (
          <>
            <span className="hint-pulse pointer-events-none absolute inset-y-0 left-0 z-10 w-[28%] bg-gradient-to-r from-black/35 to-transparent" />
            <span className="hint-pulse pointer-events-none absolute inset-y-0 right-0 z-10 w-[28%] bg-gradient-to-l from-black/35 to-transparent" />
          </>
        )}

        <motion.div
          style={{ opacity: likeOpacity }}
          className="pointer-events-none absolute left-5 top-24 z-30 -rotate-12 rounded-2xl border-[5px] border-[var(--color-like)] px-3.5 py-1 font-display text-[26px] font-bold tracking-tight text-[var(--color-like)]"
        >
          НРАВИТСЯ
        </motion.div>
        <motion.div
          style={{ opacity: nopeOpacity }}
          className="pointer-events-none absolute right-5 top-24 z-30 rotate-12 rounded-2xl border-[5px] border-[var(--color-nope)] px-3.5 py-1 font-display text-[26px] font-bold tracking-tight text-[var(--color-nope)]"
        >
          МИМО
        </motion.div>
        <motion.div style={{ opacity: superOpacity }} className="pointer-events-none absolute inset-x-0 top-32 z-30 flex justify-center">
          <span className="rounded-2xl border-[5px] border-[var(--color-super)] px-3.5 py-1 font-display text-[26px] font-bold tracking-tight text-[var(--color-super)]">
            В КОРЗИНУ
          </span>
        </motion.div>

        <div className="absolute left-3 top-7 z-20 flex flex-col items-start gap-1.5">
          {discount >= 10 && (
            <span className="rounded-full bg-[var(--color-nope)] px-2.5 py-1 text-[11px] font-extrabold text-white shadow">
              −{discount}%
            </span>
          )}
          {hot && (
            <span className="flex items-center gap-1 rounded-full bg-white/92 px-2.5 py-1 text-[11px] font-bold text-[#b57400] backdrop-blur">
              <IconFlame className="h-3.5 w-3.5" />
              Хит
            </span>
          )}
          {product.rating !== undefined && (
            <span className="flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur">
              <IconStar className="h-3.5 w-3.5 text-[var(--color-super)]" />
              <span className="tnum">{product.rating.toFixed(1)}</span>
            </span>
          )}
        </div>

        <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 via-black/55 to-transparent p-4 pt-20 text-white">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0 flex-1">
              {product.category && (
                <span className="mb-1.5 inline-block rounded-full bg-white/18 px-2 py-0.5 text-[11px] font-semibold backdrop-blur">
                  {categoryLabel(product.category)}
                </span>
              )}
              <h2 className="line-clamp-2 text-[17px] font-bold leading-snug">{product.title}</h2>
              <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="tnum font-display text-[24px] font-bold leading-none">
                  {formatRub(product.price, product.currency, rates)}
                </span>
                {product.priceMax !== undefined && (
                  <span className="tnum text-[14px] text-white/60 line-through">
                    {formatRub(product.priceMax, product.currency, rates)}
                  </span>
                )}
                {needsConversion(product.currency) && (
                  <span className="tnum text-[13px] text-white/70">{formatNative(product.price, product.currency)}</span>
                )}
              </div>
              {meta && <p className="mt-1 truncate text-[12px] text-white/70">{meta}</p>}
            </div>
            <button
              type="button"
              aria-label="Подробнее о товаре"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onOpen();
              }}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/18 backdrop-blur transition-colors active:bg-white/32"
            >
              <IconInfo className="h-6 w-6" />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
