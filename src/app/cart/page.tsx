"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Img from "@/components/Img";
import ProductSheet from "@/components/ProductSheet";
import SettingsSheet from "@/components/SettingsSheet";
import { IconCart, IconExternal, IconGear, IconTrash } from "@/components/Icons";
import { toast } from "@/components/Toast";
import { cartTotals, unitPrice, useHydrated, useStore } from "@/lib/store";
import { formatNative, formatRub, needsConversion, plural, symbolOf, toRub } from "@/lib/money";
import type { Product } from "@/lib/types";

export default function CartPage() {
  const hydrated = useHydrated();
  const cart = useStore((s) => s.cart);
  const rates = useStore((s) => s.rates);
  const setQty = useStore((s) => s.setQty);
  const removeFromCart = useStore((s) => s.removeFromCart);
  const clearCart = useStore((s) => s.clearCart);
  const [sheet, setSheet] = useState<Product | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (!hydrated) return <div className="flex-1" />;

  const totals = cartTotals(cart);
  const currencies = Object.keys(totals);
  const convertible = currencies.filter(needsConversion);
  const totalRub = currencies.reduce((sum, c) => sum + (toRub(totals[c], c, rates) ?? 0), 0);
  const totalQty = cart.reduce((s, c) => s + c.qty, 0);
  const saved = cart.reduce((sum, item) => {
    const was = item.product.priceMax;
    const now = unitPrice(item);
    if (was === undefined || was <= now) return sum;
    return sum + ((toRub(was - now, item.product.currency, rates) ?? 0) * item.qty);
  }, 0);

  async function copyList() {
    const text = cart
      .map((c) => `${c.qty} × ${c.product.title}\n${formatNative(unitPrice(c), c.product.currency)} / шт · ${c.product.url}`)
      .join("\n\n");
    const tail = currencies.map((c) => formatNative(totals[c], c)).join(" + ");
    try {
      await navigator.clipboard.writeText(
        `${text}\n\nИтого: ${tail} ≈ ${Math.round(totalRub).toLocaleString("ru-RU")} ₽`,
      );
      toast("Список скопирован", "like");
    } catch {
      toast("Браузер не дал доступ к буферу", "warn");
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="safe-top sticky top-0 z-30 flex items-center justify-between border-b border-[var(--color-line)] bg-[var(--color-surface)]/92 px-4 py-3 backdrop-blur-md">
        <h1 className="font-display text-[20px] font-bold">Корзина</h1>
        {cart.length > 0 && (
          <button type="button" onClick={clearCart} className="text-[13px] font-semibold text-[var(--color-muted)]">
            Очистить
          </button>
        )}
      </header>

      {cart.length === 0 ? (
        <Empty />
      ) : (
        <>
          <div className="flex-1 space-y-2.5 p-4 pb-52">
            <AnimatePresence initial={false}>
              {cart.map((item) => (
                <motion.div
                  key={item.product.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -40 }}
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  className="soft-shadow flex gap-3 rounded-3xl bg-[var(--color-surface)] p-2.5"
                >
                  <button type="button" onClick={() => setSheet(item.product)} className="shrink-0">
                    <Img src={item.product.images[0]} alt={item.product.title} className="h-22 w-22 rounded-2xl" fallbackLabel="" />
                  </button>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <button type="button" onClick={() => setSheet(item.product)} className="text-left">
                      <p className="line-clamp-2 text-[13px] font-medium leading-tight">{item.product.title}</p>
                    </button>
                    <p className="tnum mt-1 text-[12px] text-[var(--color-muted)]">
                      {formatRub(unitPrice(item), item.product.currency, rates)} / шт
                      {needsConversion(item.product.currency) ? ` · ${formatNative(unitPrice(item), item.product.currency)}` : ""}
                    </p>
                    <div className="mt-auto flex items-center gap-2 pt-1.5">
                      <Stepper qty={item.qty} onChange={(q) => setQty(item.product.id, q)} />
                      <span className="tnum ml-auto font-display text-[15px] font-bold">
                        {formatRub(unitPrice(item) * item.qty, item.product.currency, rates)}
                      </span>
                      <button
                        type="button"
                        aria-label="Удалить"
                        onClick={() => {
                          removeFromCart(item.product.id);
                          toast("Удалили из корзины");
                        }}
                        className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--color-surface-2)] text-[var(--color-muted)]"
                      >
                        <IconTrash className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {convertible.length > 0 && (
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="soft-shadow flex w-full items-center gap-2 rounded-2xl bg-[var(--color-surface)] px-4 py-3 text-left text-[13px]"
              >
                <IconGear className="h-4 w-4 shrink-0 text-[var(--color-muted)]" />
                <span className="text-[var(--color-muted)]">Курс: </span>
                <span className="tnum font-semibold">
                  {convertible.map((c) => `1 ${symbolOf(c)} = ${rates[c]} ₽`).join(" · ")}
                </span>
              </button>
            )}
          </div>

          <div className="fixed inset-x-0 bottom-[68px] z-30 mx-auto max-w-[480px] px-4">
            <div className="card-shadow rounded-3xl bg-[var(--color-surface)] p-4">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <span className="tnum text-[13px] text-[var(--color-muted)]">
                    {totalQty} {plural(totalQty, "штука", "штуки", "штук")}
                  </span>
                  {saved > 1 && (
                    <p className="tnum mt-0.5 text-[12px] font-semibold text-[var(--color-like)]">
                      выгода {Math.round(saved).toLocaleString("ru-RU")} ₽
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="tnum font-display text-[22px] font-bold leading-none">
                    {Math.round(totalRub).toLocaleString("ru-RU")} ₽
                  </p>
                  {convertible.length > 0 && (
                    <p className="tnum mt-0.5 text-[12px] text-[var(--color-muted)]">
                      {currencies.map((c) => formatNative(totals[c], c)).join(" + ")}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={copyList}
                  className="brand-gradient flex-1 rounded-2xl py-3 text-[15px] font-bold text-white"
                >
                  Скопировать заказ
                </button>
                <a
                  href={cart[0]?.product.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex items-center justify-center gap-1.5 rounded-2xl bg-[var(--color-surface-2)] px-4 py-3 text-[14px] font-semibold"
                >
                  К товару <IconExternal className="h-4 w-4" />
                </a>
              </div>
              <p className="mt-2 text-center text-[11px] leading-snug text-[var(--color-muted)]">
                Заказ оформляется на сайте продавца — ссылки в списке
              </p>
            </div>
          </div>
        </>
      )}

      <ProductSheet product={sheet} onClose={() => setSheet(null)} />
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} sourceLabel="" catalogSize={0} />
    </div>
  );
}

function Stepper({ qty, onChange }: { qty: number; onChange: (q: number) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-xl bg-[var(--color-surface-2)] p-0.5">
      <button
        type="button"
        aria-label="Меньше"
        onClick={() => onChange(qty - 1)}
        className="h-7 w-7 rounded-lg text-[16px] font-bold text-[var(--color-muted)]"
      >
        −
      </button>
      <span className="tnum min-w-[26px] text-center text-[14px] font-bold">{qty}</span>
      <button
        type="button"
        aria-label="Больше"
        onClick={() => onChange(qty + 1)}
        className="h-7 w-7 rounded-lg text-[16px] font-bold text-[var(--color-ink)]"
      >
        +
      </button>
    </div>
  );
}

function Empty() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-10 text-center">
      <span className="flex items-center justify-center rounded-full bg-[var(--color-brand-soft)] p-5">
        <IconCart className="h-8 w-8 text-[var(--color-brand)]" />
      </span>
      <div>
        <h2 className="font-display text-[18px] font-bold">Корзина пуста</h2>
        <p className="mt-1.5 text-[14px] leading-snug text-[var(--color-muted)]">
          Свайп вверх на карточке кладёт товар сразу сюда.
        </p>
      </div>
      <Link href="/" className="brand-gradient rounded-2xl px-6 py-3 text-[15px] font-bold text-white">
        В ленту
      </Link>
    </div>
  );
}
