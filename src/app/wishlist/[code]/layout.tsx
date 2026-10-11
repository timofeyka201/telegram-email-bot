import type { Metadata } from "next";
import { appUrl } from "@/lib/app-url";
import { wishlistByCode } from "@/lib/wish/server";
import { normalizeCode } from "@/lib/wish/types";
import { plural } from "@/lib/money";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ code: string }> };

/**
 * Разметка превью для чужого вишлиста.
 *
 * Сама страница собирается в браузере, поэтому мессенджеру с неё достаётся
 * только общее описание сайта: ссылка на список желаний выглядела как ссылка
 * на что угодно. А это главная ссылка сервиса — её отправляют не одному
 * человеку, а всем, кто собирается дарить.
 *
 * Список по закрытому коду не раскрываем: ни имени, ни числа желаний.
 * Поисковикам страницы вишлистов не нужны вовсе — код в ссылке и есть
 * единственный ключ к ней.
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { code: raw } = await params;
  const code = normalizeCode(raw);
  const base = await appUrl();
  const generic: Metadata = {
    title: "Вишлист — Swiper",
    description: "Список желаний: можно взять подарок на себя, чтобы не подарить одно и то же дважды.",
    robots: { index: false, follow: false },
  };
  if (!code) return generic;

  const list = await wishlistByCode(code).catch(() => null);
  if (!list || !list.shared) return generic;

  const count = list.items.length;
  const title = list.ownerName ? `${list.title} · ${list.ownerName}` : list.title;
  const description = count
    ? `${count} ${plural(count, "желание", "желания", "желаний")}. Можно взять подарок на себя — остальные увидят, что он занят.`
    : "Список желаний в Swiper.";

  return {
    title: `${title} — Swiper`,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      type: "website",
      siteName: "Swiper",
      title,
      description,
      url: `${base}/wishlist/${code}`,
      images: [{ url: `${base}/api/og/wishlist/${code}`, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: "summary_large_image" },
  };
}

export default function WishlistCodeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
