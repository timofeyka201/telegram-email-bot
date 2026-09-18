"use client";

import { useState } from "react";
import { IconChevron } from "./Icons";
import { hasSizes, matchesProfile, tableFor } from "@/lib/sizes";
import { useStore } from "@/lib/store";

/**
 * Гайд по размерам внутри карточки товара. Показывается только там, где он
 * уместен — для одежды и обуви, — и подсвечивает строку под профиль
 * пользователя, если тот заполнен.
 */
export default function SizeGuide({
  category,
  title,
  onEditProfile,
}: {
  category?: string;
  title?: string;
  onEditProfile: () => void;
}) {
  const sizes = useStore((s) => s.sizes);
  const [open, setOpen] = useState(false);
  const table = tableFor(category, title);
  if (!table) return null;

  const known = hasSizes(sizes);
  const mine = known ? table.rows.find((r) => matchesProfile(table, r, sizes)) : undefined;

  return (
    <section className="mt-2 bg-[var(--color-surface)] px-4 py-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-left"
      >
        <span className="flex-1">
          <span className="block text-[15px] font-bold">Гайд по размерам · {table.title}</span>
          <span className="block text-[13px] text-[var(--color-muted)]">
            {mine ? `Ваш размер: ${mine.label}` : known ? "По вашим меркам точного совпадения нет" : "Укажите мерки — подсветим вашу строку"}
          </span>
        </span>
        <IconChevron className={`h-5 w-5 shrink-0 text-[var(--color-muted)] transition-transform ${open ? "rotate-90" : ""}`} />
      </button>

      {open && (
        <div className="mt-3">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-[13px]">
              <thead>
                <tr>
                  {table.columns.map((c) => (
                    <th
                      key={c}
                      className="border-b border-[var(--color-line)] px-2 py-2 text-left font-bold text-[var(--color-muted)]"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row) => {
                  const on = mine?.label === row.label;
                  return (
                    <tr
                      key={row.label}
                      className={on ? "bg-[var(--color-brand-soft)] font-bold text-[var(--color-brand)]" : ""}
                    >
                      {row.values.map((v, i) => (
                        <td key={i} className="tnum border-b border-[var(--color-line)] px-2 py-2">
                          {v}
                          {on && i === 0 && <span className="ml-1.5 text-[11px]">— ваш</span>}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[12px] leading-snug text-[var(--color-muted)]">{table.note}</p>
          <button
            type="button"
            onClick={onEditProfile}
            className="mt-3 w-full rounded-2xl bg-[var(--color-surface-2)] py-3 text-[14px] font-semibold"
          >
            {known ? "Изменить мои размеры" : "Указать мои размеры"}
          </button>
        </div>
      )}
    </section>
  );
}
