"use client";

import { IconSearch, IconSliders, IconX } from "./Icons";

type Props = {
  categories: string[];
  active: string[];
  extraFilters: number;
  query: string;
  onToggleCategory: (category: string) => void;
  onOpenFilters: () => void;
  onClearQuery: () => void;
};

/**
 * Шапка ленты: строка поиска и быстрые фильтры — и ничего больше.
 *
 * Раньше здесь жили кольцо дневной цели, серия лайков, кнопка фильтров и
 * кнопка настроек. Значок с ползунками приходилось узнавать: по нему не
 * видно, что внутри в том числе и поиск. Теперь на том же месте строка
 * поиска — она говорит о себе сама, а открывает ту же шторку: поиск и
 * фильтры применяются одним нажатием «Показать», и разделять их незачем.
 *
 * Счётчики переехали в «Профиль», настройки — туда же. Шапка стала на
 * полсотни пикселей ниже, и всё это досталось карточке.
 */
export default function TopBar({
  categories,
  active,
  extraFilters,
  query,
  onToggleCategory,
  onOpenFilters,
  onClearQuery,
}: Props) {
  const filterCount = active.length + extraFilters;

  return (
    <header className="safe-top sticky top-0 z-30 min-w-0 bg-[var(--color-bg)]/92 backdrop-blur-md">
      <div className="flex items-center gap-2 px-4 pb-1.5 pt-2.5">
        {/* Поле только по виду: ввод живёт в шторке, где рядом цена и скидки. */}
        <button
          type="button"
          onClick={onOpenFilters}
          aria-label={query ? `Поиск: ${query}. Открыть поиск и фильтры` : "Поиск и фильтры"}
          className="soft-shadow flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-full bg-[var(--color-surface)] pl-4 pr-2 text-left"
        >
          <IconSearch className="h-[18px] w-[18px] shrink-0 text-[var(--color-muted)]" />
          <span
            className={`min-w-0 flex-1 truncate text-[15px] ${
              query ? "font-semibold text-[var(--color-ink)]" : "font-medium text-[var(--color-muted)]"
            }`}
          >
            {query || "Поиск по витрине"}
          </span>
          {filterCount > 0 && (
            <span className="tnum on-accent flex h-[22px] min-w-[22px] shrink-0 items-center justify-center rounded-full bg-[var(--color-brand)] px-1.5 text-[12px] font-extrabold">
              {filterCount}
            </span>
          )}
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-[var(--color-muted)]">
            <IconSliders className="h-[18px] w-[18px]" />
          </span>
        </button>

        {query && (
          // Быстрый сброс: вернуться ко всей витрине — частое желание, и ради
          // него не стоит открывать шторку.
          <button
            type="button"
            onClick={onClearQuery}
            aria-label="Сбросить поиск"
            className="soft-shadow flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface)] text-[var(--color-muted)]"
          >
            <IconX className="h-[18px] w-[18px]" />
          </button>
        )}
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
