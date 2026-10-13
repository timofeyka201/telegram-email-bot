"use client";

import { IconSearch, IconSliders, IconX } from "./Icons";
import type { GroupFacet } from "@/lib/providers/types";

type Props = {
  /** разделы витрины — верхний уровень строки фильтров */
  groups: GroupFacet[];
  /** выбранный раздел или null — тогда в строке сами разделы */
  group: string | null;
  /** категории выбранного раздела, а без раздела — самые полные вообще */
  categories: string[];
  active: string[];
  extraFilters: number;
  query: string;
  onPickGroup: (group: string | null) => void;
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
  groups,
  group,
  categories,
  active,
  extraFilters,
  query,
  onPickGroup,
  onToggleCategory,
  onOpenFilters,
  onClearQuery,
}: Props) {
  const filterCount = active.length + extraFilters;
  const chip = "chip shrink-0 whitespace-nowrap rounded-full px-4 text-[13px] font-semibold transition-colors";
  const off = "bg-[var(--color-surface)] text-[var(--color-ink-soft)] soft-shadow active:bg-[var(--color-surface-2)]";
  const on = "bg-[var(--color-ink)] text-[var(--color-surface)]";

  return (
    <header className="safe-top sticky top-0 z-30 min-w-0 bg-[var(--color-bg)]/92 backdrop-blur-md">
      <div className="flex items-center gap-2 px-4 pb-2.5 pt-2.5">
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

      {/*
        Строка фильтров двухуровневая, но по-прежнему одна: разделов
        одиннадцать, а категорий три с лишним десятка, и плоским списком они
        превращались в свиток, где «Купальники» надо искать скроллом.
        Выбранный раздел занимает первый чип и снимается тем же нажатием,
        поэтому высота шапки не выросла ни на пиксель — а она уже отдана
        карточке.
      */}
      {(group ? categories.length > 0 : groups.length > 0) && (
        <div className="no-scrollbar flex w-full min-w-0 items-center gap-2.5 overflow-x-auto px-4 pb-2.5">
          {group ? (
            <>
              <button
                type="button"
                onClick={() => onPickGroup(null)}
                aria-label={`Раздел «${group}». Вернуться ко всем разделам`}
                className={`${chip} ${on} flex items-center gap-1.5 pr-3`}
              >
                {group}
                <IconX className="h-3.5 w-3.5" />
              </button>
              {categories.slice(0, 14).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => onToggleCategory(c)}
                  aria-pressed={active.includes(c)}
                  className={`${chip} ${active.includes(c) ? on : off}`}
                >
                  {c}
                </button>
              ))}
            </>
          ) : (
            groups.map((g) => (
              <button
                key={g.title}
                type="button"
                onClick={() => onPickGroup(g.title)}
                className={`${chip} ${off}`}
              >
                {g.title}
              </button>
            ))
          )}
        </div>
      )}

    </header>
  );
}
