"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import Img, { prefetchImage, thumbOf } from "./Img";
import {
  IconBookmark,
  IconBookmarkFilled,
  IconCart,
  IconChevron,
  IconChevronDown,
  IconExternal,
  IconHeart,
  IconStar,
} from "./Icons";
import { categoryLabel } from "@/lib/categories";
import SizeGuide from "./SizeGuide";
import SizeProfileSheet from "./SizeProfileSheet";
import { toast } from "./Toast";
import { useStore } from "@/lib/store";
import { pushWish } from "@/lib/wish/client";
import type { Attribute, Product } from "@/lib/types";
import { compact, formatNative, formatRub, needsConversion, plural, priceRange } from "@/lib/money";

type Tab = "desc" | "specs" | "reviews";

export default function ProductSheet({ product, onClose }: { product: Product | null; onClose: () => void }) {
  return (
    <AnimatePresence>
      {product && <Sheet key={product.id} product={product} onClose={onClose} />}
    </AnimatePresence>
  );
}

function Sheet({ product, onClose }: { product: Product; onClose: () => void }) {
  const rates = useStore((s) => s.rates);
  const cart = useStore((s) => s.cart);
  const liked = useStore((s) => s.liked);
  const wishlist = useStore((s) => s.wishlist);
  const toggleWish = useStore((s) => s.toggleWish);
  const addToCart = useStore((s) => s.addToCart);
  const unlike = useStore((s) => s.unlike);
  const like = useStore((s) => s.like);

  const [full, setFull] = useState<Product>(product);
  const [enriching, setEnriching] = useState(false);
  const [tab, setTab] = useState<Tab>("desc");
  const [sizesOpen, setSizesOpen] = useState(false);

  const inCart = cart.some((c) => c.product.id === full.id);
  const wished = wishlist.some((p) => p.id === full.id);
  const isLiked = liked.some((p) => p.id === full.id);

  // Выдача поиска приходит без описания и характеристик — дотягиваем по ссылке.
  useEffect(() => {
    const thin = !product.description || product.attributes.length === 0;
    if (!thin || product.source === "demo" || product.source === "catalog") return;
    let alive = true;
    setEnriching(true);
    fetch(`/api/item?url=${encodeURIComponent(product.url)}`)
      .then((r) => r.json())
      .then((d: { product?: Product; patch?: { description?: string; attributes?: Attribute[] } }) => {
        if (!alive) return;
        if (d.product) setFull({ ...d.product, id: product.id });
        else if (d.patch) {
          setFull((prev) => {
            // Характеристики из выдачи и из карточки дополняют друг друга,
            // повторы по названию отбрасываем.
            const known = new Set(prev.attributes.map((a) => a.name.toLowerCase()));
            const extra = (d.patch!.attributes ?? []).filter((a) => !known.has(a.name.toLowerCase()));
            return {
              ...prev,
              description: prev.description || d.patch!.description,
              attributes: [...prev.attributes, ...extra],
            };
          });
        }
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
    ["reviews", `Отзывы${full.reviews.length || full.reviewsCount ? ` ${full.reviews.length || full.reviewsCount}` : ""}`],
  ];

  const chips = [
    full.category ? categoryLabel(full.category) : null,
    ...full.attributes.slice(0, 3).map((a) => a.value),
    full.minOrder && full.minOrder > 1 ? `от ${full.minOrder} шт.` : null,
  ].filter((c): c is string => !!c && c.length <= 28);

  const sellerLine = [
    full.seller?.location,
    full.seller?.years ? `${full.seller.years} лет на площадке` : null,
    full.seller?.rating !== undefined ? `рейтинг ${full.seller.rating}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 mx-auto flex max-w-[480px] flex-col"
    >
      <button type="button" aria-label="Закрыть" onClick={onClose} className="absolute inset-0 bg-black/45" />

      <motion.section
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 340, damping: 36 }}
        // Карточка не занимает экран целиком: сверху остаётся полоса фона, по
        // которой видно, что это шторка поверх ленты, и по которой её закрывают.
        className="relative mt-[calc(env(safe-area-inset-top)+56px)] flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-[32px] bg-[var(--color-surface)]"
      >
        <div className="relative flex shrink-0 items-center justify-end px-3 pb-1.5 pt-2">
          <span className="absolute left-1/2 top-3 h-[5px] w-10 -translate-x-1/2 rounded-full bg-[var(--color-line)]" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-[var(--color-ink)]"
          >
            <IconChevronDown className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[120px]">
          <Gallery images={full.images} title={full.title} />

          <div className="flex flex-col gap-3.5 px-4 pb-4 pt-4">
            <div className="flex items-end justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="tnum font-display text-[32px] leading-none">
                  {formatRub(full.price, full.currency, rates)}
                </span>
                <span className="tnum text-[13px] font-medium text-[var(--color-muted)]">
                  {full.priceMax !== undefined && full.priceMax > (full.price ?? 0)
                    ? `было ${formatRub(full.priceMax, full.currency, rates)}`
                    : needsConversion(full.currency)
                      ? priceRange(full.price, full.priceMax, full.currency)
                      : ""}
                </span>
              </div>
              {(full.rating !== undefined || !!full.reviewsCount) && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--color-surface-2)] px-3 py-2 text-[13px] font-bold">
                  <IconStar className="h-[15px] w-[15px] text-[var(--color-brand)]" />
                  {full.rating !== undefined && <span className="tnum">{full.rating.toFixed(1)}</span>}
                  {!!full.reviewsCount && <span className="tnum"> · {compact(full.reviewsCount)}</span>}
                </span>
              )}
            </div>

            <h1 className="text-[20px] font-bold leading-[1.25]">{full.title}</h1>

            {chips.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {chips.map((c, i) => (
                  <span
                    key={i}
                    className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${
                      i === 0 ? "bg-[var(--color-like-soft)]" : "border-[1.5px] border-[var(--color-line)]"
                    }`}
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}

            {full.seller?.name && (
              <a
                href={full.seller.url || full.url}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center gap-3 rounded-[var(--radius-tile)] bg-[var(--color-surface-2)] px-3 py-2.5"
              >
                <span className="on-accent flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand)] font-display text-[15px]">
                  {full.seller.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="flex min-w-0 flex-1 flex-col leading-[1.25]">
                  <span className="truncate text-[15px] font-bold">{full.seller.name}</span>
                  {sellerLine && <span className="truncate text-[13px] text-[var(--color-muted)]">{sellerLine}</span>}
                </span>
                <IconChevron className="h-5 w-5 shrink-0 text-[var(--color-muted)]" />
              </a>
            )}

            {full.tiers.length > 1 && (
              <div className="overflow-hidden rounded-[var(--radius-tile)] border border-[var(--color-line)]">
                <div className="bg-[var(--color-surface-2)] px-3.5 py-2 text-[12px] font-bold text-[var(--color-muted)]">
                  Оптовые цены
                </div>
                {full.tiers.map((t, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between border-t border-[var(--color-line)] px-3.5 py-2.5 text-[14px]"
                  >
                    <span className="text-[var(--color-muted)]">{t.to ? `${t.from}–${t.to} шт.` : `от ${t.from} шт.`}</span>
                    <span className="tnum font-bold">{formatRub(t.price, full.currency, rates)}</span>
                  </div>
                ))}
              </div>
            )}

            {full.skus.length > 0 && (
              <div>
                <p className="mb-2 text-[13px] font-bold text-[var(--color-muted)]">Варианты</p>
                <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
                  {full.skus.slice(0, 20).map((sku) => (
                    <span
                      key={sku.id}
                      className="whitespace-nowrap rounded-full border-[1.5px] border-[var(--color-line)] px-3 py-1.5 text-[13px] font-semibold"
                    >
                      {sku.name}
                      {sku.price !== undefined && (
                        <span className="ml-1.5 font-medium text-[var(--color-muted)]">
                          {formatNative(sku.price, full.currency)}
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <SizeGuide category={full.category} title={full.title} onEditProfile={() => setSizesOpen(true)} />

          {/* Вкладки заменены складными разделами: на узком экране три ярлыка в
              ряд не помещались, а описание — единственное, что читают всегда. */}
          <div className="mt-1 px-4">
            <Section title="Описание" defaultOpen>
              {enriching ? (
                <div className="skeleton h-20 w-full rounded-xl" />
              ) : (
                <p className="whitespace-pre-line text-[15px] leading-[1.45] text-[var(--color-ink-soft)]">
                  {full.description || "Продавец не добавил текстовое описание."}
                </p>
              )}
            </Section>
            <Section title="Характеристики" count={full.attributes.length}>
              {full.attributes.length === 0 ? (
                <p className="text-[14px] text-[var(--color-muted)]">Характеристики не указаны.</p>
              ) : (
                <div className="divide-y divide-[var(--color-line)]">
                  {full.attributes.map((a, i) => (
                    <div key={i} className="flex gap-3 py-2.5 text-[14px]">
                      <span className="w-1/2 shrink-0 text-[var(--color-muted)]">{a.name}</span>
                      <span className="font-semibold">{a.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </Section>
            <Section title="Отзывы" count={full.reviews.length || full.reviewsCount}>
              <Reviews product={full} />
            </Section>
          </div>

          <a
            href={full.url}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-2 flex items-center justify-between px-4 py-4 text-[14px] font-semibold"
          >
            Открыть карточку у источника
            <IconExternal className="h-[18px] w-[18px] text-[var(--color-muted)]" />
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
                like(full);
                toast("Добавили в избранное", "like");
              }
            }}
            aria-label={isLiked ? "Убрать из избранного" : "В избранное"}
            className={`flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
              isLiked
                ? "on-accent border-transparent bg-[var(--color-like)]"
                : "border-[var(--color-line)] text-[var(--color-ink)]"
            }`}
          >
            <IconHeart className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={() => {
              toggleWish(full);
              // Вишлист вошедшего живёт на сервере: его открывают по ссылке друзья.
              pushWish(full, !wished);
              toast(wished ? "Убрали из вишлиста" : "В вишлисте — следим за ценой", wished ? "default" : "like");
            }}
            aria-label={wished ? "Убрать из вишлиста" : "В вишлист"}
            title={wished ? "Убрать из вишлиста" : "В вишлист — будем следить за ценой"}
            className={`flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
              wished
                ? "on-accent border-transparent bg-[var(--color-brand)]"
                : "border-[var(--color-line)] text-[var(--color-ink)]"
            }`}
          >
            {wished ? <IconBookmarkFilled className="h-6 w-6" /> : <IconBookmark className="h-6 w-6" />}
          </button>
          <button
            type="button"
            disabled={inCart}
            onClick={() => {
              addToCart(full);
              toast("Добавили в корзину", "like");
            }}
            className="on-accent flex h-[54px] flex-1 items-center justify-center gap-2 rounded-full bg-[var(--color-brand)] text-[16px] font-extrabold disabled:bg-[var(--color-surface-2)] disabled:text-[var(--color-muted)]"
          >
            <IconCart className="h-[22px] w-[22px]" />
            {inCart ? "Уже в корзине" : "В корзину"}
          </button>
        </div>

        <SizeProfileSheet open={sizesOpen} onClose={() => setSizesOpen(false)} />
      </motion.section>
    </motion.div>
  );
}

/** Складной раздел: строка с заголовком, под ней содержимое. */
function Section({
  title,
  count,
  defaultOpen,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="border-t-[1.5px] border-[var(--color-line)] first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-[52px] w-full items-center justify-between gap-2 text-left text-[16px] font-bold"
      >
        <span>
          {title}
          {!!count && <span className="tnum font-semibold text-[var(--color-muted)]"> · {count}</span>}
        </span>
        <IconChevronDown
          className={`h-5 w-5 shrink-0 text-[var(--color-muted)] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="pb-4">{children}</div>}
    </div>
  );
}

/**
 * Галерея в рамке, а не во всю ширину: так видно, что снимок принадлежит
 * карточке, а не фону, и остаётся место под счётчик кадров.
 */
function Gallery({ images, title }: { images: string[]; title: string }) {
  const [index, setIndex] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const list = images.length ? images : [""];

  function onScroll() {
    const el = ref.current;
    if (!el) return;
    setIndex(Math.round(el.scrollLeft / el.clientWidth));
  }

  // Соседние кадры подтягиваем заранее: пролистывание не должно упираться в сеть.
  useEffect(() => {
    prefetchImage(list[index + 1]);
    if (index > 0) prefetchImage(list[index - 1]);
  }, [index, list]);

  return (
    <div>
      <div className="relative mx-4 overflow-hidden rounded-3xl">
        <div
          ref={ref}
          onScroll={onScroll}
          className="no-scrollbar flex aspect-[6/5] w-full snap-x snap-mandatory overflow-x-auto"
        >
          {list.map((src, i) => (
            <Img
              key={i}
              src={src}
              alt={`${title} — фото ${i + 1}`}
              // Видимый кадр важнее остальных: без подсказки браузер тянет их
              // всем поровну, и рассматриваемое фото ждёт тех, что за экраном.
              eager={i === index}
              className="h-full w-full shrink-0 snap-center"
              fallbackLabel={title.slice(0, 60)}
            />
          ))}
        </div>
        {list.length > 1 && (
          <span className="tnum absolute bottom-3 right-3 rounded-full bg-black/70 px-2.5 py-1 text-[12px] font-bold text-white">
            {index + 1} / {list.length}
          </span>
        )}
      </div>

      {list.length > 1 && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pt-2.5">
          {list.map((src, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Фото ${i + 1}`}
              onClick={() => ref.current?.scrollTo({ left: i * ref.current.clientWidth, behavior: "smooth" })}
              className={`h-14 w-14 shrink-0 overflow-hidden rounded-[14px] transition-shadow ${
                i === index ? "shadow-[0_0_0_2px_var(--color-ink)]" : ""
              }`}
            >
              <Img src={thumbOf(src)} alt="" className="h-full w-full" fallbackLabel="" />
            </button>
          ))}
        </div>
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
        {product.reviewsCount
          ? `У товара ${product.reviewsCount} ${plural(product.reviewsCount, "отзыв", "отзыва", "отзывов")}, но их тексты источник в выдаче не отдаёт.`
          : "Отзывов пока нет."}
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
