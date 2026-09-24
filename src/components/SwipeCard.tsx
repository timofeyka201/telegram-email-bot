"use client";

import { motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import Img, { prefetchImage } from "./Img";
import { IconCart, IconChevron, IconFlame, IconHeart, IconStar, IconX } from "./Icons";
import { categoryLabel } from "@/lib/categories";
import type { Product } from "@/lib/types";
import type { Decision } from "@/lib/store";

/** Как уходит карточка: по решению человека или потому что ленту пересобрали. */
export type ExitWay = Decision | "reset";
import { compact, formatNative, formatRub, needsConversion, plural } from "@/lib/money";

const SWIPE_DISTANCE = 110;
const SWIPE_VELOCITY = 520;
const SUPER_DISTANCE = 130;
/** Палец никогда не стоит на месте: сдвиг меньше этого считаем тапом, а не протяжкой. */
const TAP_SLOP = 12;
/** Долгое удержание — не тап: человек передумал или просто держит карточку. */
const TAP_TIME = 600;

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

/**
 * Штамп решения. Заливка вместо обводки: на пёстрой фотографии контурная
 * надпись читалась через раз, а плашка видна всегда.
 */
function Stamp({
  style,
  className,
  children,
}: {
  style: React.ComponentProps<typeof motion.div>["style"];
  className: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      style={style}
      className={`pointer-events-none absolute z-30 flex items-center gap-2 rounded-2xl py-2 pl-3 pr-4 font-display text-[26px] leading-none ${className}`}
    >
      {children}
    </motion.div>
  );
}

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

  const cardRef = useRef<HTMLDivElement>(null);
  /** Фотография занимает не всю карточку: под ней непрозрачный блок с ценой. */
  const photoRef = useRef<HTMLDivElement>(null);
  /** Откуда и когда начался жест. null — значит начало до нас не дошло. */
  const press = useRef<{ x: number; y: number; at: number } | null>(null);

  function handleDragEnd(_: unknown, info: PanInfo) {
    const { offset, velocity } = info;
    if (offset.y < -SUPER_DISTANCE && Math.abs(offset.x) < 100) return onDecide("super");
    if (offset.x > SWIPE_DISTANCE || velocity.x > SWIPE_VELOCITY) return onDecide("like");
    if (offset.x < -SWIPE_DISTANCE || velocity.x < -SWIPE_VELOCITY) return onDecide("dislike");
    x.set(0);
    y.set(0);
  }

  const prevImage = () => setImgIndex((i) => (i - 1 + images.length) % images.length);
  const nextImage = () => setImgIndex((i) => (i + 1) % images.length);

  /**
   * Соседние снимки грузим заранее. Раньше этого не делал никто: лента
   * подтягивала только первое фото будущих карточек, а остальные начинали
   * качаться в тот момент, когда человек по ним тапнул, — отсюда и пауза на
   * каждом втором фото. Берём только соседей, а не всю карточку: десяток
   * снимков разом отнял бы канал у того, который и так на экране.
   */
  useEffect(() => {
    if (!interactive || images.length < 2) return;
    prefetchImage(images[(imgIndex + 1) % images.length]);
    if (images.length > 2) prefetchImage(images[(imgIndex - 1 + images.length) % images.length]);
  }, [interactive, imgIndex, images]);

  /**
   * Тап распознаём сами, а не через onTap у Framer Motion: тот приходит с
   * обработчика на окне, где currentTarget уже пуст — размеры карточки из него
   * не достать, и любой тап превращался в «открыть карточку». Заодно здесь
   * видно, было движение или нет, поэтому протяжка больше не открывает товар.
   */
  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const start = press.current;
    press.current = null;
    if (!interactive || !start) return;

    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (moved > TAP_SLOP || Date.now() - start.at > TAP_TIME) return;

    const rect = photoRef.current?.getBoundingClientRect();
    // Тап ниже фотографии — это тап по описанию: там листать нечего.
    if (!rect || !rect.width || start.y > rect.bottom) return onOpen();

    const ratio = (start.x - rect.left) / rect.width;
    if (images.length > 1 && ratio < 0.28) prevImage();
    else if (images.length > 1 && ratio > 0.72) nextImage();
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
        exit: (custom: ExitWay) =>
          // «reset» — карточка уходит не по решению человека, а потому что
          // ленту пересобрали. Такая просто гаснет, без полёта и штампа.
          custom === "reset"
            ? { opacity: 0, transition: { duration: 0.15 } }
            : {
                x: custom === "like" ? 640 : custom === "dislike" ? -640 : 0,
                y: custom === "super" ? -740 : 40,
                rotate: custom === "like" ? 18 : custom === "dislike" ? -18 : 0,
                opacity: 0,
                transition: { duration: 0.32, ease: "easeOut" },
              },
      }}
      exit="exit"
      transition={{ type: "spring", stiffness: 320, damping: 34 }}
      drag={interactive}
      dragElastic={0.7}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      onDragEnd={handleDragEnd}
      onPointerDown={(e) => {
        press.current = { x: e.clientX, y: e.clientY, at: Date.now() };
      }}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        press.current = null;
      }}
    >
      <div
        ref={cardRef}
        className="card-shadow relative flex h-full w-full flex-col overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-surface)]"
      >
        {/* Фотография и подпись разделены: раньше текст лежал на снимке под
            градиентом и съедал его нижнюю треть у каждой карточки. */}
        <div ref={photoRef} className="relative min-h-0 flex-1">
          <Img
            src={images[imgIndex]}
            alt={product.title}
            eager={depth === 0}
            className="absolute inset-0 h-full w-full"
            fallbackLabel={product.title.slice(0, 60)}
          />
          <motion.div className="pointer-events-none absolute inset-0 bg-black" style={{ opacity: dim }} />

          {images.length > 1 && (
            <div className="absolute inset-x-4 top-3 z-20 flex gap-1" aria-hidden>
              {images.slice(0, 10).map((_, i) => (
                <span
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-colors ${i === imgIndex ? "bg-white" : "bg-white/50"}`}
                />
              ))}
            </div>
          )}

          {/* Стрелки листания. Тапом по краям фото листалось и раньше, но догадаться
              об этом было нельзя — а горизонтальную протяжку занимает свайп карточки. */}
          {interactive && images.length > 1 && (
            <>
              {[
                { side: "left", label: "Предыдущее фото", act: prevImage, rotate: "rotate-180" },
                { side: "right", label: "Следующее фото", act: nextImage, rotate: "" },
              ].map(({ side, label, act, rotate }) => (
                <button
                  key={side}
                  type="button"
                  aria-label={label}
                  // Кнопка лежит на перетаскиваемой карточке: не отдаём ей жест,
                  // иначе нажатие посчитается началом свайпа.
                  onPointerDown={(e) => e.stopPropagation()}
                  onPointerUp={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    act();
                  }}
                  className={`absolute top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition-colors active:bg-black/55 ${
                    side === "left" ? "left-2" : "right-2"
                  }`}
                >
                  <IconChevron className={`h-5 w-5 ${rotate}`} />
                </button>
              ))}
            </>
          )}

          {/* Зоны тапа не видны сами по себе — подсказываем их на первых карточках */}
          {interactive && showHint && images.length > 1 && (
            <>
              <span className="hint-pulse pointer-events-none absolute inset-y-0 left-0 z-10 w-[28%] bg-gradient-to-r from-black/35 to-transparent" />
              <span className="hint-pulse pointer-events-none absolute inset-y-0 right-0 z-10 w-[28%] bg-gradient-to-l from-black/35 to-transparent" />
            </>
          )}

          <Stamp style={{ opacity: likeOpacity }} className="on-accent left-4 top-9 -rotate-[14deg] bg-[var(--color-like)]">
            <IconHeart className="h-6 w-6" />
            ХОЧУ
          </Stamp>
          <Stamp style={{ opacity: nopeOpacity }} className="right-4 top-9 rotate-[14deg] bg-[var(--color-nope)] text-white">
            <IconX className="h-6 w-6" />
            МИМО
          </Stamp>
          <Stamp
            style={{ opacity: superOpacity }}
            className="on-accent left-1/2 top-16 -translate-x-1/2 -rotate-[6deg] bg-[var(--color-super)]"
          >
            <IconCart className="h-6 w-6" />
            В КОРЗИНУ
          </Stamp>

          <div className="absolute left-4 top-8 z-20 flex flex-col items-start gap-1.5">
            {discount >= 10 && (
              <span className="rounded-full bg-[var(--color-nope)] px-2.5 py-1 text-[11px] font-extrabold text-white">
                −{discount}%
              </span>
            )}
            {hot && (
              <span className="on-accent flex items-center gap-1 rounded-full bg-[var(--color-brand)] px-2.5 py-1 text-[11px] font-extrabold">
                <IconFlame className="h-3.5 w-3.5" />
                Хит
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-1.5 px-[18px] pb-4 pt-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="tnum font-display text-[26px] leading-none">
              {formatRub(product.price, product.currency, rates)}
            </span>
            <div className="flex shrink-0 items-center gap-1.5">
              {product.priceMax !== undefined && product.priceMax > (product.price ?? 0) && (
                <span className="tnum text-[13px] text-[var(--color-muted)] line-through">
                  {formatRub(product.priceMax, product.currency, rates)}
                </span>
              )}
              {product.rating !== undefined && (
                <span className="flex items-center gap-1 rounded-full bg-[var(--color-surface-2)] px-2.5 py-1 text-[13px] font-bold">
                  <IconStar className="h-3.5 w-3.5 text-[var(--color-brand)]" />
                  <span className="tnum">{product.rating.toFixed(1)}</span>
                </span>
              )}
            </div>
          </div>
          <h2 className="line-clamp-2 min-h-[42px] text-[16px] font-semibold leading-[1.3]">{product.title}</h2>
          <p className="truncate text-[13px] font-medium text-[var(--color-muted)]">
            {meta || (product.category ? categoryLabel(product.category) : "")}
            {needsConversion(product.currency) && ` · ${formatNative(product.price, product.currency)}`}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
