"use client";

import { useEffect, useState } from "react";
import Sheet from "./Sheet";
import { SIZE_TABLES, type SizeProfile } from "@/lib/sizes";
import { useStore } from "@/lib/store";

const NUMBERS: { key: keyof SizeProfile; label: string; unit: string; hint: string }[] = [
  { key: "height", label: "Рост", unit: "см", hint: "170" },
  { key: "chest", label: "Обхват груди", unit: "см", hint: "94" },
  { key: "waist", label: "Талия", unit: "см", hint: "78" },
  { key: "hips", label: "Бёдра", unit: "см", hint: "98" },
  { key: "foot", label: "Длина стопы", unit: "см", hint: "26,5" },
];

/**
 * Профиль размеров. Заполняется один раз и используется, чтобы подсветить
 * нужную строку в гайде по размерам — именно несовпадение размера чаще всего
 * приводит к возврату.
 */
export default function SizeProfileSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const saved = useStore((s) => s.sizes);
  const setSizes = useStore((s) => s.setSizes);
  const [draft, setDraft] = useState<SizeProfile>(saved);

  useEffect(() => {
    if (open) setDraft(saved);
  }, [open, saved]);

  const setNumber = (key: keyof SizeProfile, raw: string) => {
    const value = raw.replace(",", ".").trim();
    setDraft((d) => ({ ...d, [key]: value === "" ? undefined : Number(value) }));
  };

  return (
    <Sheet
      open={open}
      title="Мои размеры"
      onClose={onClose}
      footer={
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={() => setDraft({})}
            className="rounded-2xl bg-[var(--color-surface-2)] px-5 py-3.5 text-[15px] font-semibold text-[var(--color-ink-soft)]"
          >
            Очистить
          </button>
          <button
            type="button"
            onClick={() => {
              setSizes(draft);
              onClose();
            }}
            className="brand-gradient flex-1 rounded-full py-3.5 text-[15px] font-bold"
          >
            Сохранить
          </button>
        </div>
      }
    >
      <p className="mb-3 mt-1 text-[13px] leading-snug text-[var(--color-muted)]">
        Заполните что знаете — этого хватит, чтобы в гайде по размерам подсветилась ваша строка.
      </p>

      <div className="soft-shadow space-y-2 rounded-2xl bg-[var(--color-surface)] px-4 py-3.5">
        {NUMBERS.map(({ key, label, unit, hint }) => (
          <label key={key} className="flex items-center gap-3">
            <span className="flex-1 text-[14px]">{label}</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.5"
              placeholder={hint}
              value={(draft[key] as number | undefined) ?? ""}
              onChange={(e) => setNumber(key, e.target.value)}
              className="tnum w-24 rounded-xl bg-[var(--color-surface-2)] px-3 py-2 text-right text-[15px] outline-none"
            />
            <span className="w-6 text-[13px] text-[var(--color-muted)]">{unit}</span>
          </label>
        ))}
      </div>

      <p className="mb-2 mt-5 text-[12px] font-bold uppercase tracking-wider text-[var(--color-muted)]">
        Привычные размеры
      </p>
      <div className="soft-shadow space-y-2 rounded-2xl bg-[var(--color-surface)] px-4 py-3.5">
        <label className="flex items-center gap-3">
          <span className="flex-1 text-[14px]">Одежда</span>
          <select
            value={draft.clothing ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, clothing: e.target.value || undefined }))}
            className="w-28 rounded-xl bg-[var(--color-surface-2)] px-3 py-2 text-[15px] outline-none"
          >
            <option value="">—</option>
            {SIZE_TABLES[0].rows.map((r) => (
              <option key={r.label} value={r.label}>
                {r.label} · {r.values[1]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-3">
          <span className="flex-1 text-[14px]">Обувь</span>
          <select
            value={draft.shoes ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, shoes: e.target.value || undefined }))}
            className="w-28 rounded-xl bg-[var(--color-surface-2)] px-3 py-2 text-[15px] outline-none"
          >
            <option value="">—</option>
            {SIZE_TABLES[1].rows.map((r) => (
              <option key={r.label} value={r.label}>
                {r.label} · {r.values[3]} см
              </option>
            ))}
          </select>
        </label>
      </div>
    </Sheet>
  );
}
