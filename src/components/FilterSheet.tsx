"use client";

import { useEffect, useState } from "react";
import Sheet from "./Sheet";
import { IconCheck, IconSearch, IconX } from "./Icons";
import { formatNative } from "@/lib/money";
import type { Filters } from "@/lib/providers/types";

type Props = {
  open: boolean;
  onClose: () => void;
  categories: string[];
  maxPrice: number;
  currency: string;
  value: Filters;
  query: string;
  onApply: (filters: Filters, query: string) => void;
};

export default function FilterSheet({ open, onClose, categories, maxPrice, currency, value, query, onApply }: Props) {
  // Правки живут в черновике: пока не нажали «Показать», лента не дёргается.
  const [draft, setDraft] = useState<Filters>(value);
  const [text, setText] = useState(query);
  useEffect(() => {
    if (open) {
      setDraft(value);
      setText(query);
    }
  }, [open, value, query]);

  const ceil = Math.max(1, Math.ceil(maxPrice));
  const price = draft.maxPrice ?? ceil;
  const active =
    (draft.categories ?? []).length + (draft.maxPrice !== undefined ? 1 : 0) + (draft.onlyDiscount ? 1 : 0) + (text.trim() ? 1 : 0);

  const apply = () => {
    onApply(draft, text.trim());
    onClose();
  };

  const toggle = (c: string) =>
    setDraft((d) => {
      const list = d.categories ?? [];
      return { ...d, categories: list.includes(c) ? list.filter((x) => x !== c) : [...list, c] };
    });

  return (
    <Sheet
      open={open}
      title="Фильтры"
      onClose={onClose}
      footer={
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={() => {
              setDraft({});
              setText("");
            }}
            disabled={active === 0}
            className="rounded-2xl bg-[var(--color-surface-2)] px-5 py-3.5 text-[15px] font-semibold text-[var(--color-ink-soft)] disabled:opacity-40"
          >
            Сбросить
          </button>
          <button
            type="button"
            onClick={apply}
            className="brand-gradient flex-1 rounded-2xl py-3.5 text-[15px] font-bold text-white"
          >
            Показать
          </button>
        </div>
      }
    >
      <p className="mb-2 mt-1 text-[12px] font-bold uppercase tracking-wider text-[var(--color-muted)]">Поиск</p>
      <div className="soft-shadow flex items-center gap-2 rounded-2xl bg-[var(--color-surface)] px-3.5 py-1">
        <IconSearch className="h-4.5 w-4.5 shrink-0 text-[var(--color-muted)]" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") apply();
          }}
          placeholder="Название, бренд или категория"
          className="w-full bg-transparent py-2.5 text-[15px] outline-none placeholder:text-[var(--color-muted)]"
        />
        {text && (
          <button type="button" onClick={() => setText("")} aria-label="Очистить" className="shrink-0 text-[var(--color-muted)]">
            <IconX className="h-4 w-4" />
          </button>
        )}
      </div>

      <p className="mb-2 mt-6 text-[12px] font-bold uppercase tracking-wider text-[var(--color-muted)]">Категории</p>
      <div className="flex flex-wrap gap-2">
        {categories.map((c) => {
          const on = (draft.categories ?? []).includes(c);
          return (
            <button
              key={c}
              type="button"
              onClick={() => toggle(c)}
              aria-pressed={on}
              className={`flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px] font-medium transition-colors ${
                on
                  ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)] text-[var(--color-brand)]"
                  : "border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-soft)]"
              }`}
            >
              {on && <IconCheck className="h-3.5 w-3.5" />}
              {c}
            </button>
          );
        })}
      </div>

      <p className="mb-2 mt-6 text-[12px] font-bold uppercase tracking-wider text-[var(--color-muted)]">Цена до</p>
      <div className="soft-shadow rounded-2xl bg-[var(--color-surface)] px-4 py-3.5">
        <div className="flex items-baseline justify-between">
          <span className="text-[19px] font-extrabold">{formatNative(price, currency)}</span>
          {draft.maxPrice !== undefined && (
            <button
              type="button"
              onClick={() => setDraft((d) => ({ ...d, maxPrice: undefined }))}
              className="text-[13px] font-semibold text-[var(--color-brand)]"
            >
              Любая
            </button>
          )}
        </div>
        <input
          type="range"
          min={1}
          max={ceil}
          step={Math.max(1, Math.round(ceil / 200))}
          value={price}
          onChange={(e) => setDraft((d) => ({ ...d, maxPrice: Number(e.target.value) }))}
          aria-label="Максимальная цена"
          className="mt-3 w-full accent-[var(--color-brand)]"
        />
      </div>

      <label className="soft-shadow mt-3 flex cursor-pointer items-center gap-3 rounded-2xl bg-[var(--color-surface)] px-4 py-3.5">
        <input
          type="checkbox"
          checked={!!draft.onlyDiscount}
          onChange={(e) => setDraft((d) => ({ ...d, onlyDiscount: e.target.checked }))}
          className="h-5 w-5 accent-[var(--color-brand)]"
        />
        <span>
          <span className="block text-[15px] font-semibold leading-tight">Только со скидкой</span>
          <span className="block text-[13px] text-[var(--color-muted)]">Где есть зачёркнутая старая цена</span>
        </span>
      </label>
    </Sheet>
  );
}
