import type { Metadata, Viewport } from "next";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import ToastHost from "@/components/Toast";
import SyncAgent from "@/components/SyncAgent";
import ServiceWorker from "@/components/ServiceWorker";

export const metadata: Metadata = {
  title: "Swiper — свайп-витрина товаров",
  description:
    "Листайте товары как ленту знакомств: вправо — нравится, влево — мимо, вверх — сразу в корзину. Карточки с фото, характеристиками и отзывами, избранное и корзина.",
  applicationName: "Swiper",
  // capable убирает интерфейс Safari, когда приложение открыто с домашнего
  // экрана. statusBarStyle оставлен default: он не даёт содержимому уехать
  // под часы, в отличие от black-translucent.
  appleWebApp: { capable: true, title: "Swiper", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icons/icon-192.png", sizes: "192x192" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  // Телефоны любят превращать цены и артикулы в ссылки на звонок.
  formatDetection: { telephone: false },
  other: {
    // Next отдаёт только стандартный mobile-web-app-capable, а Safari до iOS 16.4
    // понимает лишь этот, устаревший. Без него ярлык открывается вкладкой.
    "apple-mobile-web-app-capable": "yes",
  },
  openGraph: {
    title: "Swiper — свайп-витрина товаров",
    description: "Вправо — нравится, влево — мимо, вверх — в корзину.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eceef2" },
    { media: "(prefers-color-scheme: dark)", color: "#111215" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

/**
 * Тема выставляется до первой отрисовки: иначе при выбранной тёмной теме
 * страница успевает моргнуть светлой.
 */
const themeBootstrap = `
try {
  var s = localStorage.getItem("swiper-theme");
  if (s === "dark" || s === "light") document.documentElement.dataset.theme = s;
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Dela+Gothic+One&family=Onest:wght@400;500;600;700;800&display=swap"
        />
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        <div className="app-shell flex min-h-[100dvh] flex-col">
          <main className="flex flex-1 flex-col">{children}</main>
          <BottomNav />
        </div>
        <ToastHost />
        <SyncAgent />
        <ServiceWorker />
      </body>
    </html>
  );
}
