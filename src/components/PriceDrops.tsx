"use client";

import { motion } from "framer-motion";
import Img from "./Img";
import { IconPriceDown, IconX } from "./Icons";
import { formatRub } from "@/lib/money";
import { useStore, type PriceDrop } from "@/lib/store";

/**
 * Сообщение о снижении цены. Появляется, когда отложенный товар подешевел —
 * это единственное, ради чего стоит отвлекать человека от ленты, поэтому
 * показываем один раз и по нажатию убираем.
 */
export default function PriceDrops({ drops, onOpen }: { drops: PriceDrop[]; onOpen?: (id: string) => void }) {
  const rates = useStore((s) => s.rates);
  const dismiss = useStore((s) => s.dismissDrops);
  if (!drops.length) return null;

  const total = drops.reduce((sum, d) => sum + (d.was - d.now), 0);
  const currency = drops[0].currency;

  return (
    <motion.section
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-4 mt-3 overflow-hidden rounded-3xl bg-[var(--color-like-soft)]"
    >
      <div className="flex items-center gap-2.5 px-4 pt-3.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-like)] text-white">
          <IconPriceDown className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold leading-tight text-[var(--color-ink)]">
            {drops.length === 1 ? "Товар подешевел" : `Подешевели ${drops.length}`}
          </p>
          <p className="tnum text-[12px] text-[var(--color-ink-soft)]">
            Выгода {formatRub(total, currency, rates)}
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Скрыть"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/5 text-[var(--color-ink-soft)]"
        >
          <IconX className="h-4 w-4" />
        </button>
      </div>

      <div className="no-scrollbar mt-2.5 flex gap-2 overflow-x-auto px-4 pb-3.5">
        {drops.slice(0, 8).map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => onOpen?.(d.id)}
            className="flex w-[148px] shrink-0 flex-col overflow-hidden rounded-2xl bg-[var(--color-surface)] text-left"
          >
            <Img src={d.image} alt="" className="aspect-square w-full" fallbackLabel="" />
            <span className="px-2.5 py-2">
              <span className="tnum block text-[14px] font-bold text-[var(--color-like)]">
                {formatRub(d.now, d.currency, rates)}
              </span>
              <span className="tnum block text-[11px] text-[var(--color-muted)] line-through">
                {formatRub(d.was, d.currency, rates)}
              </span>
              <span className="mt-0.5 line-clamp-1 block text-[11px] text-[var(--color-ink-soft)]">{d.title}</span>
            </span>
          </button>
        ))}
      </div>
    </motion.section>
  );
}
