"use client";

import { Logo } from "./Brand";
import { IconFlame, IconGear, IconSliders } from "./Icons";
import { DAILY_GOAL } from "@/lib/store";

type Props = {
  daySwipes: number;
  streak: number;
  categories: string[];
  active: string[];
  extraFilters: number;
  onToggleCategory: (category: string) => void;
  onOpenFilters: () => void;
  onOpenSettings: () => void;
};

/** Кольцо дневной цели: маленький повод вернуться завтра. */
function GoalRing({ value }: { value: number }) {
  const pct = Math.min(1, value / DAILY_GOAL);
  const r = 13;
  const c = 2 * Math.PI * r;
  const done = pct >= 1;
  return (
    <div
      className="relative h-9 w-9"
      role="img"
      aria-label={`Дневная цель: ${value} из ${DAILY_GOAL} карточек`}
      title={`Дневная цель: ${value} из ${DAILY_GOAL}`}
    >
      <svg viewBox="0 0 36 36" className="h-9 w-9 -rotate-90" aria-hidden>
        <circle cx="18" cy="18" r={r} fill="none" stroke="var(--color-line)" strokeWidth="3.5" />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          stroke={done ? "var(--color-like)" : "var(--color-brand)"}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: "stroke-dashoffset 420ms cubic-bezier(.2,.8,.2,1)" }}
        />
      </svg>
      <span className="tnum absolute inset-0 flex items-center justify-center text-[11px] font-extrabold">
        {done ? "✓" : value}
      </span>
    </div>
  );
}

export default function TopBar({
  daySwipes,
  streak,
  categories,
  active,
  extraFilters,
  onToggleCategory,
  onOpenFilters,
  onOpenSettings,
}: Props) {
  const filterCount = active.length + extraFilters;

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--color-line)] bg-[var(--color-surface)]/92 backdrop-blur-md">
      <div className="flex items-center gap-2 px-4 pb-1.5 pt-2.5">
        <Logo />

        <div className="ml-auto flex items-center gap-2">
          {streak > 2 && (
            <span
              className="flex items-center gap-1 rounded-full bg-[var(--color-super-soft)] px-2.5 py-1 text-[12px] font-bold text-[#b57400] dark:text-[var(--color-super)]"
              title={`${streak} лайков подряд`}
            >
              <IconFlame className="h-3.5 w-3.5" />
              <span className="tnum">{streak}</span>
            </span>
          )}
          <GoalRing value={daySwipes} />
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Настройки"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-[var(--color-ink-soft)] transition-colors active:bg-[var(--color-line)]"
          >
            <IconGear className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Быстрые фильтры на виду: один тап вместо похода в меню */}
      <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto px-4 pb-2">
        <button
          type="button"
          onClick={onOpenFilters}
          className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors ${
            filterCount > 0
              ? "border-transparent bg-[var(--color-brand)] text-[var(--color-brand-ink)]"
              : "border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-soft)]"
          }`}
        >
          <IconSliders className="h-4 w-4" />
          Фильтры
          {filterCount > 0 && <span className="tnum">{filterCount}</span>}
        </button>

        {categories.slice(0, 14).map((c) => {
          const on = active.includes(c);
          return (
            <button
              key={c}
              type="button"
              onClick={() => onToggleCategory(c)}
              aria-pressed={on}
              className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors ${
                on
                  ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)] text-[var(--color-brand)]"
                  : "border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-soft)] active:bg-[var(--color-surface-2)]"
              }`}
            >
              {c}
            </button>
          );
        })}
      </div>
    </header>
  );
}
