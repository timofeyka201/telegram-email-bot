import type { Metadata, Viewport } from "next";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import ToastHost from "@/components/Toast";

export const metadata: Metadata = {
  title: "Swiper — свайп-витрина товаров",
  description:
    "Листайте товары как ленту знакомств: вправо — нравится, влево — мимо, вверх — сразу в корзину. Карточки с фото, характеристиками и отзывами, избранное и корзина.",
  applicationName: "Swiper",
  appleWebApp: { capable: true, title: "Swiper", statusBarStyle: "default" },
  openGraph: {
    title: "Swiper — свайп-витрина товаров",
    description: "Вправо — нравится, влево — мимо, вверх — в корзину.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f4fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0e15" },
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
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Unbounded:wght@600;700&display=swap"
        />
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        <div className="app-shell flex min-h-[100dvh] flex-col">
          <main className="flex flex-1 flex-col">{children}</main>
          <BottomNav />
        </div>
        <ToastHost />
      </body>
    </html>
  );
}
