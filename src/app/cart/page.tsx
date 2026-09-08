"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Img from "@/components/Img";
import ProductSheet from "@/components/ProductSheet";
import { IconCart, IconExternal, IconTrash } from "@/components/Icons";
import { toast } from "@/components/Toast";
import { cartTotals, unitPrice, useHydrated, useStore } from "@/lib/store";
import { formatNative, formatRub, needsConversion, plural, symbolOf, toRub } from "@/lib/money";
import type { Product } from "@/lib/types";

export default function CartPage() {
  const hydrated = useHydrated();
  const cart = useStore((s) => s.cart);
  const rates = useStore((s) => s.rates);
  const setRate = useStore((s) => s.setRate);
  const setQty = useStore((s) => s.setQty);
  const removeFromCart = useStore((s) => s.removeFromCart);
  const clearCart = useStore((s) => s.clearCart);
  const [sheet, setSheet] = useState<Product | null>(null);
  const [ratesOpen, setRatesOpen] = useState(false);

  if (!hydrated) return <div className="flex-1" />;

  const totals = cartTotals(cart);
  const currencies = Object.keys(totals);
  const totalRub = currencies.reduce((sum, c) => sum + (toRub(totals[c], c, rates) ?? 0), 0);
  const totalQty = cart.reduce((s, c) => s + c.qty, 0);
  const convertible = currencies.filter(needsConversion);

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
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[var(--color-line)] bg-[var(--color-surface)]/95 px-4 py-3 backdrop-blur">
        <h1 className="text-[17px] font-bold">Корзина</h1>
        {cart.length > 0 && (
          <button type="button" onClick={clearCart} className="text-[13px] font-medium text-[var(--color-muted)]">
            Очистить
          </button>
        )}
      </header>

      {cart.length === 0 ? (
        <Empty />
      ) : (
        <>
          <div className="flex-1 space-y-2.5 p-4 pb-40">
            <AnimatePresence initial={false}>
              {cart.map((item) => (
                <motion.div
                  key={item.product.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -40 }}
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  className="soft-shadow flex gap-3 rounded-2xl bg-[var(--color-surface)] p-2.5"
                >
                  <button type="button" onClick={() => setSheet(item.product)} className="shrink-0">
                    <Img src={item.product.images[0]} alt={item.product.title} className="h-20 w-20 rounded-xl" fallbackLabel="" />
                  </button>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <button type="button" onClick={() => setSheet(item.product)} className="text-left">
                      <p className="line-clamp-2 text-[13px] leading-tight">{item.product.title}</p>
                    </button>
                    <p className="mt-1 text-[12px] text-[var(--color-muted)]">
                      {formatRub(unitPrice(item), item.product.currency, rates)} / шт
                      {needsConversion(item.product.currency)
                        ? ` · ${formatNative(unitPrice(item), item.product.currency)}`
                        : ""}
                    </p>
                    <div className="mt-auto flex items-center gap-2 pt-1.5">
                      <Stepper qty={item.qty} onChange={(q) => setQty(item.product.id, q)} />
                      <span className="ml-auto text-[15px] font-bold">
                        {formatRub(unitPrice(item) * item.qty, item.product.currency, rates)}
                      </span>
                      <button
                        type="button"
                        aria-label="Удалить"
                        onClick={() => removeFromCart(item.product.id)}
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
              onClick={() => setRatesOpen((v) => !v)}
              className="soft-shadow w-full rounded-2xl bg-[var(--color-surface)] px-4 py-3 text-left text-[13px]"
            >
              <span className="text-[var(--color-muted)]">Курс пересчёта: </span>
              <span className="font-semibold">
                {convertible.length
                  ? convertible.map((c) => `1 ${symbolOf(c)} = ${rates[c] ?? "?"} ₽`).join(" · ")
                  : "все цены уже в рублях"}
              </span>
            </button>
            )}
            {ratesOpen && convertible.length > 0 && (
              <div className="soft-shadow space-y-2 rounded-2xl bg-[var(--color-surface)] px-4 py-3">
                {convertible.map((c) => (
                  <label key={c} className="flex items-center gap-3">
                    <span className="w-16 text-[13px] text-[var(--color-muted)]">1 {symbolOf(c)} =</span>
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={rates[c] ?? 1}
                      onChange={(e) => setRate(c, Number(e.target.value))}
                      className="flex-1 rounded-xl bg-[var(--color-surface-2)] px-3 py-2 text-[15px] outline-none"
                    />
                    <span className="text-[13px] text-[var(--color-muted)]">₽</span>
                  </label>
                ))}
                <p className="text-[12px] leading-snug text-[var(--color-muted)]">
                  Курсы задаются вручную. Доставка и комиссии в расчёт не входят.
                </p>
              </div>
            )}
          </div>

          <div className="fixed inset-x-0 bottom-[57px] z-30 mx-auto max-w-[480px] border-t border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] text-[var(--color-muted)]">
                {totalQty} {plural(totalQty, "штука", "штуки", "штук")}
              </span>
              <div className="text-right">
                <p className="text-[20px] font-bold leading-none">
                  {Math.round(totalRub).toLocaleString("ru-RU")} ₽
                </p>
                {convertible.length > 0 && (
                  <p className="text-[12px] text-[var(--color-muted)]">
                    {currencies.map((c) => formatNative(totals[c], c)).join(" + ")}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                onClick={copyList}
                className="flex-1 rounded-2xl bg-[var(--color-accent)] py-3 text-[15px] font-semibold text-white"
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
          </div>
        </>
      )}

      <ProductSheet product={sheet} onClose={() => setSheet(null)} />
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
        className="h-7 w-7 rounded-lg text-[16px] font-semibold text-[var(--color-muted)]"
      >
        −
      </button>
      <span className="min-w-[26px] text-center text-[14px] font-semibold tabular-nums">{qty}</span>
      <button
        type="button"
        aria-label="Больше"
        onClick={() => onChange(qty + 1)}
        className="h-7 w-7 rounded-lg text-[16px] font-semibold text-[var(--color-ink)]"
      >
        +
      </button>
    </div>
  );
}

function Empty() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-10 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#f0edff]">
        <IconCart className="h-8 w-8 text-[var(--color-super)]" />
      </span>
      <div>
        <h2 className="text-[17px] font-bold">Корзина пуста</h2>
        <p className="mt-1.5 text-[14px] leading-snug text-[var(--color-muted)]">
          Свайп вверх на карточке кладёт товар сразу сюда.
        </p>
      </div>
      <Link href="/" className="rounded-2xl bg-[var(--color-accent)] px-6 py-3 text-[15px] font-semibold text-white">
        В ленту
      </Link>
    </div>
  );
}
