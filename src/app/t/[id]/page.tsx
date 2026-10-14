import type { Metadata } from "next";
import Link from "next/link";
import { IconExternal, IconStar } from "@/components/Icons";
import SaveToLikes from "@/components/SaveToLikes";
import ShareButton from "@/components/ShareButton";
import { appUrl } from "@/lib/app-url";
import { productById } from "@/lib/catalog";
import { categoryLabel } from "@/lib/categories";
import { compact, formatNative, formatRub, needsConversion, plural } from "@/lib/money";
import { currentRates } from "@/lib/rates";
import { shopUrl } from "@/lib/shop";
import type { Product } from "@/lib/types";
import TrackView from "@/components/TrackView";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Страница товара.
 *
 * Нужна ровно для одного: чтобы товаром можно было поделиться. До неё
 * карточка жила только внутри ленты, и отправить её человеку было нечем —
 * оставалось скопировать ссылку на AliExpress, то есть отдать и переход, и
 * комиссию, и будущего пользователя.
 *
 * Поэтому страница открывается без регистрации и без приложения, собирается
 * на сервере (мессенджеру нужна готовая разметка, а не приложение, которое
 * оживёт через секунду) и ведёт в ленту.
 */

/** Номер товара AliExpress внутри нашего идентификатора. */
const itemIdOf = (id: string) => /^ae-(\d{6,20})$/.exec(id.replace(/-r\d+$/, ""))?.[1];

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const product = productById(id);
  const base = await appUrl();

  if (!product) {
    return {
      title: "Товар — Swiper",
      description: "Витрина со свайпами: вправо — нравится, влево — мимо, вверх — в корзину.",
      robots: { index: false },
    };
  }

  const { rates } = await currentRates();
  const price = formatRub(product.price, product.currency, rates);
  const parts = [
    product.rating !== undefined ? `Оценка ${product.rating.toFixed(1)}` : null,
    product.soldCount ? `${compact(product.soldCount)} ${plural(product.soldCount, "заказ", "заказа", "заказов")}` : null,
    product.seller?.location,
    product.category ? categoryLabel(product.category) : null,
  ].filter(Boolean);

  return {
    // Заголовок превью — то, что видно в переписке. Цена в нём важнее
    // названия сервиса, поэтому она идёт сразу за названием товара.
    title: `${product.title} — ${price}`,
    description: parts.length ? `${parts.join(" · ")}. Открыть на Swiper.` : "Открыть на Swiper.",
    alternates: { canonical: `${base}/t/${product.id}` },
    openGraph: {
      type: "website",
      siteName: "Swiper",
      title: `${product.title} — ${price}`,
      description: parts.join(" · ") || "Витрина со свайпами",
      url: `${base}/t/${product.id}`,
      images: [{ url: `${base}/api/og/${product.id}`, width: 1200, height: 630, alt: product.title }],
    },
    twitter: { card: "summary_large_image" },
  };
}

export default async function ProductPage({ params }: Params) {
  const { id } = await params;
  const product = productById(id);
  const itemId = itemIdOf(id);

  // Карточки может не быть: витрина пересобирается каждую ночь, а ссылка
  // живёт в чужой переписке месяцами. Тупик вместо страницы — худшее, что
  // можно сделать с человеком, который по ней пришёл.
  if (!product) {
    return (
      <Shell>
        <div className="soft-shadow rounded-[var(--radius-tile)] bg-[var(--color-surface)] px-5 py-8 text-center">
          <h1 className="font-display text-[22px] leading-tight">Товар уехал с витрины</h1>
          <p className="mx-auto mt-2 max-w-[320px] text-[14px] leading-snug text-[var(--color-muted)]">
            Витрина обновляется каждую ночь, и эта карточка в неё больше не попала.
            {itemId ? " Сам товар, скорее всего, на месте — можно открыть его в магазине." : ""}
          </p>
          <div className="mt-5 flex flex-col gap-2">
            {itemId && (
              <a
                href={`/api/go/${encodeURIComponent(id)}`}
                target="_blank"
                rel="noreferrer noopener nofollow sponsored"
                className="brand-gradient flex min-h-[52px] items-center justify-center gap-2 rounded-full text-[15px] font-bold"
              >
                Открыть в магазине <IconExternal className="h-[18px] w-[18px]" />
              </a>
            )}
            <Link
              href="/"
              className="flex min-h-[52px] items-center justify-center rounded-2xl bg-[var(--color-surface-2)] text-[15px] font-semibold"
            >
              Смотреть витрину
            </Link>
          </div>
        </div>
      </Shell>
    );
  }

  const { rates } = await currentRates();
  const discount =
    product.priceMax !== undefined && product.price !== undefined && product.priceMax > product.price
      ? Math.round((1 - product.price / product.priceMax) * 100)
      : 0;
  const meta = [
    product.soldCount !== undefined
      ? `${compact(product.soldCount)} ${plural(product.soldCount, "заказ", "заказа", "заказов")}`
      : null,
    product.reviewsCount
      ? `${compact(product.reviewsCount)} ${plural(product.reviewsCount, "отзыв", "отзыва", "отзывов")}`
      : null,
    product.seller?.location,
    product.seller?.name,
  ].filter(Boolean);

  return (
    <Shell product={product}>
      <TrackView kind="item" />
      <article className="soft-shadow overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-surface)]">
        <div className="relative aspect-square w-full bg-[var(--color-surface-2)]">
          {/* Обычный img, а не наш компонент: страницу собирает сервер, и
              картинка должна быть в разметке сразу — её читают и мессенджеры,
              и поисковики. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={product.images[0] ?? `/api/placeholder?seed=${encodeURIComponent(product.id)}`}
            alt={product.title}
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
          {discount >= 10 && (
            <span className="absolute left-3 top-3 rounded-full bg-[var(--color-nope)] px-3 py-1.5 text-[12px] font-extrabold text-white">
              −{discount}%
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2 px-5 pb-5 pt-4">
          <div className="flex items-center justify-between gap-3">
            <span className="tnum font-display text-[28px] leading-none">
              {formatRub(product.price, product.currency, rates)}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {product.priceMax !== undefined && product.priceMax > (product.price ?? 0) && (
                <span className="tnum text-[14px] text-[var(--color-muted)] line-through">
                  {formatRub(product.priceMax, product.currency, rates)}
                </span>
              )}
              {product.rating !== undefined && (
                <span className="flex items-center gap-1 rounded-full bg-[var(--color-surface-2)] px-3 py-1.5 text-[14px] font-bold">
                  <IconStar className="h-4 w-4 text-[var(--color-brand)]" />
                  <span className="tnum">{product.rating.toFixed(1)}</span>
                </span>
              )}
            </span>
          </div>

          <h1 className="text-[17px] font-semibold leading-[1.35]">{product.title}</h1>

          {meta.length > 0 && (
            <p className="text-[13px] font-medium text-[var(--color-muted)]">
              {meta.join(" · ")}
              {needsConversion(product.currency) && ` · ${formatNative(product.price, product.currency)}`}
            </p>
          )}

          {product.description && (
            <p className="mt-1 whitespace-pre-line text-[14px] leading-snug text-[var(--color-ink-soft)]">
              {product.description.slice(0, 600)}
            </p>
          )}
        </div>
      </article>

      <div className="mt-3 flex flex-col gap-2">
        <a
          href={shopUrl(product, "item")}
          target="_blank"
          rel="noreferrer noopener nofollow sponsored"
          className="brand-gradient flex min-h-[54px] items-center justify-center gap-2 rounded-full text-[16px] font-extrabold"
        >
          Открыть в магазине <IconExternal className="h-5 w-5" />
        </a>
        <SaveToLikes product={product} />
        <Link
          href="/"
          className="flex min-h-[52px] items-center justify-center rounded-2xl bg-[var(--color-surface-2)] text-[15px] font-semibold"
        >
          Листать похожее в ленте
        </Link>
      </div>

      <p className="mt-3 text-center text-[12px] leading-snug text-[var(--color-muted)]">
        {/* Честно и мелким шрифтом: ссылка партнёрская, но покупателю это
            ничего не стоит. */}
        Заказ оформляется на стороне магазина по партнёрской ссылке — цена для вас не меняется.
      </p>
    </Shell>
  );
}

/** Общая рамка страницы: шапка с названием сервиса и ссылкой в ленту. */
function Shell({ children, product }: { children: React.ReactNode; product?: Product }) {
  return (
    <div className="flex flex-1 flex-col px-4 pb-10">
      <header className="safe-top flex items-center justify-between gap-2 py-3">
        <Link href="/" className="font-display text-[24px] leading-none">
          Swiper
        </Link>
        <span className="flex items-center gap-2">
          {product && <ShareButton product={product} className="soft-shadow !bg-[var(--color-surface)]" />}
          <Link
            href="/"
            className="flex min-h-[44px] items-center rounded-full bg-[var(--color-surface)] px-4 text-[13px] font-bold soft-shadow"
          >
            В ленту
          </Link>
        </span>
      </header>
      {children}
    </div>
  );
}
