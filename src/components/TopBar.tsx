"use client";

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
    <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0 -rotate-90" aria-hidden>
      <circle cx="16" cy="16" r={r} fill="none" stroke="var(--color-line)" strokeWidth="4" />
      <circle
        cx="16"
        cy="16"
        r={r}
        fill="none"
        stroke={done ? "var(--color-like)" : "var(--color-brand)"}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        style={{ transition: "stroke-dashoffset 420ms cubic-bezier(.2,.8,.2,1)" }}
      />
    </svg>
  );
}

const roundButton =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface)] soft-shadow text-[var(--color-ink)] transition-colors active:bg-[var(--color-surface-2)]";

/**
 * Шапка собрана вокруг одной капсулы: цель дня и серия лайков — это про одно
 * и то же (сколько сегодня просмотрено), и раздельными значками они читались
 * как два независимых счётчика. Действия вынесены в круглые кнопки справа.
 *
 * Кнопки поиска из макета здесь нет намеренно: поиск живёт внутри шторки
 * фильтров, и вторая кнопка, открывающая ту же шторку, только путала бы.
 */
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
    <header className="safe-top sticky top-0 z-30 min-w-0 bg-[var(--color-bg)]/92 backdrop-blur-md">
      <div className="flex items-center gap-2 px-4 pb-1.5 pt-2.5">
        <div
          className="soft-shadow flex h-11 min-w-0 items-center gap-2.5 rounded-full bg-[var(--color-surface)] py-0 pl-1.5 pr-3.5"
          role="img"
          aria-label={`Дневная цель: ${daySwipes} из ${DAILY_GOAL} карточек`}
          title={`Дневная цель: ${daySwipes} из ${DAILY_GOAL}`}
        >
          <GoalRing value={daySwipes} />
          <span className="flex min-w-0 flex-col leading-[1.1]">
            <span className="tnum text-[14px] font-bold">
              {daySwipes} из {DAILY_GOAL}
            </span>
            <span className="text-[11px] font-medium text-[var(--color-muted)]">цель дня</span>
          </span>
          {streak > 2 && (
            <>
              <span className="h-6 w-px shrink-0 bg-[var(--color-line)]" />
              <span
                className="flex shrink-0 items-center gap-0.5 text-[14px] font-extrabold"
                title={`${streak} лайков подряд`}
              >
                <IconFlame className="h-5 w-5 text-[var(--color-brand)]" />
                <span className="tnum">{streak}</span>
              </span>
            </>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenFilters}
            aria-label={filterCount > 0 ? `Фильтры, выбрано ${filterCount}` : "Фильтры"}
            className={`relative ${roundButton}`}
          >
            <IconSliders className="h-5 w-5" />
            {filterCount > 0 && (
              <span className="tnum on-accent absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-[var(--color-bg)] bg-[var(--color-brand)] px-1 text-[11px] font-extrabold">
                {filterCount}
              </span>
            )}
          </button>
          <button type="button" onClick={onOpenSettings} aria-label="Настройки" className={roundButton}>
            <IconGear className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Быстрые фильтры на виду: один тап вместо похода в меню */}
      {categories.length > 0 && (
        <div className="no-scrollbar flex w-full min-w-0 items-center gap-1.5 overflow-x-auto px-4 pb-2">
          {categories.slice(0, 14).map((c) => {
            const on = active.includes(c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => onToggleCategory(c)}
                aria-pressed={on}
                className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                  on
                    ? "bg-[var(--color-ink)] text-[var(--color-surface)]"
                    : "bg-[var(--color-surface)] text-[var(--color-ink-soft)] soft-shadow active:bg-[var(--color-surface-2)]"
                }`}
              >
                {c}
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
}
