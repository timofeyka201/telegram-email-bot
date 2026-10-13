"use client";

import { useEffect, useState } from "react";
import Sheet from "./Sheet";
import { IconCheck, IconSearch, IconX } from "./Icons";
import { formatNative } from "@/lib/money";
import type { Filters, GroupFacet } from "@/lib/providers/types";

type Props = {
  open: boolean;
  onClose: () => void;
  /** разделы витрины с категориями внутри — те же, что в строке под шапкой */
  groups: GroupFacet[];
  maxPrice: number;
  currency: string;
  value: Filters;
  query: string;
  onApply: (filters: Filters, query: string) => void;
};

export default function FilterSheet({ open, onClose, groups, maxPrice, currency, value, query, onApply }: Props) {
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
    (draft.categories ?? []).length +
    (draft.group ? 1 : 0) +
    (draft.maxPrice !== undefined ? 1 : 0) +
    (draft.onlyDiscount ? 1 : 0) +
    (text.trim() ? 1 : 0);

  const apply = () => {
    onApply(draft, text.trim());
    onClose();
  };

  const toggle = (c: string) =>
    setDraft((d) => {
      const list = d.categories ?? [];
      return { ...d, categories: list.includes(c) ? list.filter((x) => x !== c) : [...list, c] };
    });

  /** Категории выбранного раздела. Без раздела их не показываем вовсе. */
  const inside = draft.group ? (groups.find((g) => g.title === draft.group)?.categories ?? []) : [];

  const pickGroup = (group: string | null) =>
    setDraft((d) => {
      // Категория принадлежит разделу и уходит вместе с ним — ровно как в
      // строке под шапкой, иначе два фильтра пересекаются в пустоту.
      const next = group ? (groups.find((g) => g.title === group)?.categories ?? []) : [];
      return { ...d, group: group ?? undefined, categories: (d.categories ?? []).filter((c) => next.includes(c)) };
    });

  const chip = "chip gap-1.5 rounded-full border px-4 text-[13px] font-medium transition-colors";
  const chipOn = "border-[var(--color-brand)] bg-[var(--color-brand-soft)] text-[var(--color-brand)]";
  const chipOff = "border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-soft)]";

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
            className="brand-gradient flex-1 rounded-full py-3.5 text-[15px] font-bold"
          >
            Показать
          </button>
        </div>
      }
    >
      <p className="mb-2 mt-1 text-[12px] font-bold uppercase tracking-wider text-[var(--color-muted)]">Поиск</p>
      <div className="field soft-shadow flex items-center gap-2 rounded-2xl bg-[var(--color-surface)] px-3.5">
        <IconSearch className="h-4.5 w-4.5 shrink-0 text-[var(--color-muted)]" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") apply();
          }}
          placeholder="Название, бренд или категория"
          className="h-12 w-full bg-transparent text-[15px] outline-none placeholder:text-[var(--color-muted)]"
        />
        {text && (
          <button
            type="button"
            onClick={() => setText("")}
            aria-label="Очистить"
            className="tap -mr-2.5 flex shrink-0 items-center justify-center text-[var(--color-muted)]"
          >
            <IconX className="h-4 w-4" />
          </button>
        )}
      </div>

      {/*
        Раздел и категория, а не три с лишним десятка категорий кучей.
        Плоским списком шторка превращалась в простыню, в которой «Купальники»
        стоят между «Кухней» и «Мебелью»: искать глазами дольше, чем набрать
        в поиске. Разделов одиннадцать — они помещаются на экран, а категории
        показываются только у выбранного.
      */}
      <p className="mb-2 mt-6 text-[12px] font-bold uppercase tracking-wider text-[var(--color-muted)]">Раздел</p>
      <div className="flex flex-wrap gap-2">
        {draft.group ? (
          /*
            Выбранный раздел занимает место всех остальных: иначе категории
            уезжают под четырнадцать чипов, и до них надо доскроллить —
            а ради них шторку и открывали.
          */
          <button
            type="button"
            onClick={() => pickGroup(null)}
            aria-label={`Раздел «${draft.group}». Выбрать другой`}
            className={`${chip} ${chipOn} pr-3`}
          >
            {draft.group}
            <IconX className="h-3.5 w-3.5" />
          </button>
        ) : (
          groups.map((g) => (
            <button
              key={g.title}
              type="button"
              onClick={() => pickGroup(g.title)}
              className={`${chip} ${chipOff}`}
            >
              {g.title}
            </button>
          ))
        )}
      </div>

      {draft.group ? (
        <>
          <p className="mb-2 mt-6 text-[12px] font-bold uppercase tracking-wider text-[var(--color-muted)]">
            Категории в разделе
          </p>
          <div className="flex flex-wrap gap-2">
            {inside.map((c) => {
              const on = (draft.categories ?? []).includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggle(c)}
                  aria-pressed={on}
                  className={`${chip} ${on ? chipOn : chipOff}`}
                >
                  {on && <IconCheck className="h-3.5 w-3.5" />}
                  {c}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <p className="mt-2 text-[13px] text-[var(--color-muted)]">
          Выберите раздел — покажем категории внутри него.
        </p>
      )}

      <p className="mb-2 mt-6 text-[12px] font-bold uppercase tracking-wider text-[var(--color-muted)]">Цена до</p>
      <div className="soft-shadow rounded-2xl bg-[var(--color-surface)] px-4 py-3.5">
        <div className="flex items-baseline justify-between">
          <span className="text-[19px] font-extrabold">{formatNative(price, currency)}</span>
          {draft.maxPrice !== undefined && (
            <button
              type="button"
              onClick={() => setDraft((d) => ({ ...d, maxPrice: undefined }))}
              className="-mr-2 -my-2 rounded-xl px-2 py-2 text-[13px] font-semibold text-[var(--color-brand)]"
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
          className="mt-2 h-11 w-full accent-[var(--color-brand)]"
        />
      </div>

      <label className="soft-shadow mt-3 flex min-h-[56px] cursor-pointer items-center gap-3 rounded-2xl bg-[var(--color-surface)] px-4 py-3">
        <input
          type="checkbox"
          checked={!!draft.onlyDiscount}
          onChange={(e) => setDraft((d) => ({ ...d, onlyDiscount: e.target.checked }))}
          className="h-[22px] w-[22px] shrink-0 accent-[var(--color-brand)]"
        />
        <span>
          <span className="block text-[15px] font-semibold leading-tight">Только со скидкой</span>
          <span className="block text-[13px] text-[var(--color-muted)]">Где есть зачёркнутая старая цена</span>
        </span>
      </label>
    </Sheet>
  );
}
