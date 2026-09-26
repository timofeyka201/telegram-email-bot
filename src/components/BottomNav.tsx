"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { IconBookmark, IconCart, IconHeart, IconLayers } from "./Icons";
import { useHydrated, useStore } from "@/lib/store";

/**
 * Активный раздел отмечен не полоской сверху, а капсулой под иконкой: так
 * подсказка оказывается там, куда и смотрят, а верхний край меню остаётся
 * чистой линией.
 */
const items = [
  { href: "/", label: "Лента", Icon: IconLayers, badge: "like" },
  { href: "/likes", label: "Избранное", Icon: IconHeart, badge: "like" },
  { href: "/wishlist", label: "Вишлист", Icon: IconBookmark, badge: "like" },
  { href: "/cart", label: "Корзина", Icon: IconCart, badge: "brand" },
] as const;

export default function BottomNav() {
  const pathname = usePathname();
  const hydrated = useHydrated();
  const likes = useStore((s) => s.liked.length);
  const wishes = useStore((s) => s.wishTotal ?? s.wishlist.length);
  const cart = useStore((s) => s.cart.length);
  const counts: Record<string, number> = { "/likes": likes, "/wishlist": wishes, "/cart": cart };

  return (
    <nav className="safe-bottom sticky bottom-0 z-40 border-t border-[var(--color-line)] bg-[var(--color-surface)]">
      <div className="mx-auto grid max-w-[480px] grid-cols-4 px-2 pb-2 pt-2">
        {items.map(({ href, label, Icon, badge }) => {
          // Чужой вишлист лежит на /wishlist/КОД — вкладка должна оставаться подсвеченной.
          const active = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
          const count = hydrated ? counts[href] : 0;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center gap-1 text-[12px] transition-colors ${
                active ? "font-bold text-[var(--color-ink)]" : "font-semibold text-[var(--color-muted)]"
              }`}
            >
              <span className="relative flex h-8 w-14 items-center justify-center">
                {active && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-full bg-[var(--color-brand-soft)]"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                <Icon className={`relative h-[22px] w-[22px] ${active ? "text-[var(--color-brand)]" : ""}`} />
                {!!count && (
                  <span
                    className={`tnum absolute -top-0.5 right-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-extrabold on-accent ${
                      badge === "brand" ? "bg-[var(--color-brand)]" : "bg-[var(--color-like)]"
                    }`}
                  >
                    {count > 99 ? "99+" : count}
                  </span>
                )}
              </span>
              <span className="max-w-full truncate px-0.5">{label}</span>
            </Link>
          );
        })}
      </div>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
