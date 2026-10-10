import type { Stats } from "./store";

/**
 * Ранги вместо дневной цели.
 *
 * Дневная цель жила в шапке ленты и считала одно: сколько карточек просмотрено
 * сегодня. Назавтра счётчик обнулялся, и всё, что человек успел наделать за
 * месяц, исчезало без следа. Ранг устроен наоборот: он накапливается и никуда
 * не уходит, поэтому его и видно в профиле, а не поверх ленты.
 *
 * Очки считаются из того, что человек и так делает: карточка — одно очко,
 * «нравится» — ещё два. Правило простое нарочно: его можно написать в одну
 * строку под полосой прогресса, и оно не требует объяснений.
 */

export type RankId = "bronze" | "silver" | "gold";

export type Rank = {
  id: RankId;
  title: string;
  from: number;
  /** Цвет медали: заливка значка и полосы прогресса. */
  color: string;
  /** Чем светится значок. Тень цветом ранга читается и на тёмной теме. */
  glow: string;
  hint: string;
};

export const RANKS: Rank[] = [
  {
    id: "bronze",
    title: "Бронза",
    from: 0,
    color: "#c0825a",
    glow: "rgba(192,130,90,.38)",
    hint: "Начало пути: вкус только настраивается",
  },
  {
    id: "silver",
    title: "Серебро",
    from: 500,
    color: "#9aa3b0",
    glow: "rgba(154,163,176,.38)",
    hint: "Лента уже подстроилась под вас",
  },
  {
    id: "gold",
    title: "Золото",
    from: 2500,
    color: "#e2a615",
    glow: "rgba(226,166,21,.42)",
    hint: "Высший ранг — вы видели почти всё",
  },
];

/** Очки за всё время: карточка — одно, «нравится» — ещё два. */
export function rankPoints(stats: Pick<Stats, "swipes" | "likes">): number {
  return stats.swipes + stats.likes * 2;
}

export type RankState = {
  rank: Rank;
  /** Следующий ранг или null, если текущий последний. */
  next: Rank | null;
  points: number;
  /** Сколько очков осталось до следующего ранга. */
  toNext: number;
  /** Доля пути до следующего ранга, 0…1. На последнем ранге — 1. */
  progress: number;
};

export function rankOf(points: number): RankState {
  // Идём с конца: первый подошедший порог и есть текущий ранг. Перебором, а не
  // findLastIndex, — его нет в Safari до 15.4, а приложение открывают с
  // домашнего экрана и на старых телефонах.
  let index = 0;
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (points >= RANKS[i].from) {
      index = i;
      break;
    }
  }
  const rank = RANKS[index];
  const next = RANKS[index + 1] ?? null;
  if (!next) return { rank, next, points, toNext: 0, progress: 1 };
  const span = next.from - rank.from;
  return {
    rank,
    next,
    points,
    toNext: Math.max(0, next.from - points),
    progress: Math.min(1, Math.max(0, (points - rank.from) / span)),
  };
}
