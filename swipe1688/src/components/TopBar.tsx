"use client";

import { IconFlame, IconSearch } from "./Icons";
import { DAILY_GOAL } from "@/lib/store";

type Props = {
  daySwipes: number;
  streak: number;
  remaining: number;
  onOpenParse: () => void;
};

function GoalRing({ value }: { value: number }) {
  const pct = Math.min(1, value / DAILY_GOAL);
  const r = 13;
  const c = 2 * Math.PI * r;
  const done = pct >= 1;
  return (
    <div className="relative h-8 w-8" title={`Дневная цель: ${value} из ${DAILY_GOAL}`}>
      <svg viewBox="0 0 32 32" className="h-8 w-8 -rotate-90">
        <circle cx="16" cy="16" r={r} fill="none" stroke="var(--color-line)" strokeWidth="3.5" />
        <circle
          cx="16"
          cy="16"
          r={r}
          fill="none"
          stroke={done ? "var(--color-like)" : "var(--color-accent)"}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: "stroke-dashoffset 400ms ease" }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold tabular-nums">
        {done ? "✓" : value}
      </span>
    </div>
  );
}

export default function TopBar({ daySwipes, streak, remaining, onOpenParse }: Props) {
  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-[var(--color-line)] bg-[var(--color-surface)]/95 px-4 py-2.5 backdrop-blur">
      <GoalRing value={daySwipes} />
      {streak > 1 && (
        <span className="flex items-center gap-1 rounded-full bg-[#fff2e8] px-2.5 py-1 text-xs font-semibold text-[var(--color-accent)]">
          <IconFlame className="h-3.5 w-3.5" />
          {streak} подряд
        </span>
      )}
      <div className="ml-auto flex items-center gap-2">
        <span className="text-xs font-medium text-[var(--color-muted)]">
          {remaining > 0 ? `Ещё ${remaining}` : "Лента пуста"}
        </span>
        <button
          type="button"
          onClick={onOpenParse}
          aria-label="Новый парсинг"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-[var(--color-ink)] transition-colors active:bg-[var(--color-line)]"
        >
          <IconSearch className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
}
