"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { IconCart, IconHeart, IconLayers } from "./Icons";
import { useHydrated, useStore } from "@/lib/store";

const items = [
  { href: "/", label: "Лента", Icon: IconLayers },
  { href: "/likes", label: "Избранное", Icon: IconHeart },
  { href: "/cart", label: "Корзина", Icon: IconCart },
] as const;

export default function BottomNav() {
  const pathname = usePathname();
  const hydrated = useHydrated();
  const likes = useStore((s) => s.liked.length);
  const cart = useStore((s) => s.cart.length);
  const counts: Record<string, number> = { "/likes": likes, "/cart": cart };

  return (
    <nav className="safe-bottom sticky bottom-0 z-40 border-t border-[var(--color-line)] bg-[var(--color-surface)]/94 backdrop-blur-md">
      <div className="mx-auto flex max-w-[480px] items-stretch">
        {items.map(({ href, label, Icon }) => {
          const active = pathname === href;
          const badge = hydrated ? counts[href] : 0;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`relative flex flex-1 flex-col items-center gap-1 pb-2 pt-2.5 text-[11px] font-bold transition-colors ${
                active ? "text-[var(--color-brand)]" : "text-[var(--color-muted)]"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="nav-pill"
                  className="absolute inset-x-5 top-0 h-[3px] rounded-b-full bg-[var(--color-brand)]"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span className="relative">
                <Icon className="h-6 w-6" />
                {!!badge && (
                  <span className="tnum absolute -right-2.5 -top-1.5 min-w-[18px] rounded-full bg-[var(--color-brand)] px-1 text-center text-[10px] font-extrabold leading-[18px] text-white">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </span>
              {label}
            </Link>
          );
        })}
      </div>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
