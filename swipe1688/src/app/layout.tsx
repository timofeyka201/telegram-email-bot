import type { Metadata, Viewport } from "next";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import ToastHost from "@/components/Toast";

export const metadata: Metadata = {
  title: "Свайпы 1688 — находите товары одним движением",
  description:
    "Свайп-лента товаров с 1688: вправо — нравится, влево — мимо. Карточки с фото, описанием и отзывами, избранное и корзина.",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
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
