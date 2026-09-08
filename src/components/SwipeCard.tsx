"use client";

import { motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { useState } from "react";
import Img from "./Img";
import { IconFlame, IconInfo, IconStar } from "./Icons";
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
  onDecide: (d: Decision) => void;
  onOpen: () => void;
  onDrag?: (x: number, y: number) => void;
};

export default function SwipeCard({ product, rates, depth, onDecide, onOpen, onDrag }: Props) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-260, 0, 260], [-15, 0, 15]);
  const likeOpacity = useTransform(x, [24, 130], [0, 1]);
  const nopeOpacity = useTransform(x, [-130, -24], [1, 0]);
  const superOpacity = useTransform(y, [-140, -50], [1, 0]);

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
    onDrag?.(0, 0);
  }

  /** Тап по краям листает фото, тап по центру открывает карточку — как в ленте историй. */
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
  // Показываем то, что источник реально отдал: продажи, иначе отзывы.
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
      initial={{ scale: 1 - depth * 0.045, y: depth * 12, opacity: depth > 2 ? 0 : 1 }}
      animate={{ scale: 1 - depth * 0.045, y: depth === 0 ? 0 : depth * 12, opacity: depth > 2 ? 0 : 1 }}
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
      onDrag={(_, info) => onDrag?.(info.offset.x, info.offset.y)}
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

        {/* индикатор фото */}
        {images.length > 1 && (
          <div className="absolute inset-x-3 top-3 z-20 flex gap-1">
            {images.slice(0, 10).map((_, i) => (
              <span
                key={i}
                className={`h-[3px] flex-1 rounded-full transition-colors ${
                  i === imgIndex ? "bg-white" : "bg-white/35"
                }`}
              />
            ))}
          </div>
        )}

        {/* штампы решения */}
        <motion.div
          style={{ opacity: likeOpacity }}
          className="pointer-events-none absolute left-5 top-28 z-30 -rotate-12 rounded-xl border-4 border-[var(--color-like)] px-3 py-1 text-2xl font-black tracking-wide text-[var(--color-like)]"
        >
          НРАВИТСЯ
        </motion.div>
        <motion.div
          style={{ opacity: nopeOpacity }}
          className="pointer-events-none absolute right-5 top-28 z-30 rotate-12 rounded-xl border-4 border-[var(--color-nope)] px-3 py-1 text-2xl font-black tracking-wide text-[var(--color-nope)]"
        >
          МИМО
        </motion.div>
        <motion.div
          style={{ opacity: superOpacity }}
          className="pointer-events-none absolute inset-x-0 top-36 z-30 flex justify-center"
        >
          <span className="rounded-xl border-4 border-[var(--color-super)] px-3 py-1 text-2xl font-black tracking-wide text-[var(--color-super)]">
            В КОРЗИНУ
          </span>
        </motion.div>

        {/* бейджи */}
        <div className="absolute left-3 top-8 z-20 flex flex-col items-start gap-1.5">
          {hot && (
            <span className="flex items-center gap-1 rounded-full bg-[var(--color-accent)] px-2.5 py-1 text-[11px] font-semibold text-white shadow">
              <IconFlame className="h-3.5 w-3.5" />
              Хит продаж
            </span>
          )}
          {product.rating !== undefined && (
            <span className="flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
              <IconStar className="h-3.5 w-3.5 text-[var(--color-amber)]" />
              {product.rating.toFixed(1)}
            </span>
          )}
        </div>

        {/* низ карточки */}
        <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-4 pt-16 text-white">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <h2 className="line-clamp-2 text-[17px] font-semibold leading-snug">{product.title}</h2>
              <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-[22px] font-bold leading-none">
                  {formatRub(product.price, product.currency, rates)}
                </span>
                {needsConversion(product.currency) && (
                  <span className="text-sm text-white/70">{formatNative(product.price, product.currency)}</span>
                )}
                {product.priceMax !== undefined && (
                  <span className="text-xs text-white/60 line-through">
                    {formatRub(product.priceMax, product.currency, rates)}
                  </span>
                )}
              </div>
              {meta && <p className="mt-1 truncate text-xs text-white/70">{meta}</p>}
            </div>
            <button
              type="button"
              aria-label="Подробнее о товаре"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onOpen();
              }}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15 backdrop-blur transition-colors active:bg-white/30"
            >
              <IconInfo className="h-6 w-6" />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
