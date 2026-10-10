"use client";

import { IconFlame, IconMedal } from "./Icons";
import { plural } from "@/lib/money";
import { RANKS, rankOf, rankPoints } from "@/lib/ranks";
import { DAILY_GOAL, useStore } from "@/lib/store";

/**
 * Ранг и счётчики.
 *
 * Прежняя геймификация — кольцо дневной цели — висела в шапке ленты и
 * считала только сегодняшний день: к утру всё обнулялось, и смотреть было
 * не на что. Ранг копится и не сбрасывается, поэтому ему место в профиле, а
 * дневная цель с серией остались мелкой строкой под ним: как повод вернуться
 * они работают, как главный показатель — нет.
 */
export default function RankCard() {
  const stats = useStore((s) => s.stats);
  const points = rankPoints(stats);
  const { rank, next, toNext, progress } = rankOf(points);

  return (
    <div className="soft-shadow overflow-hidden rounded-[var(--radius-tile)] bg-[var(--color-surface)]">
      <div className="flex items-center gap-3.5 px-4 pb-3.5 pt-4">
        <span
          className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full text-white"
          style={{ background: rank.color, boxShadow: `0 8px 22px ${rank.glow}` }}
        >
          <IconMedal className="h-7 w-7" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[20px] leading-none">{rank.title}</p>
          <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-[var(--color-muted)]">{rank.hint}</p>
        </div>
        <span className="shrink-0 text-right">
          <span className="tnum block font-display text-[19px] leading-none">{points.toLocaleString("ru-RU")}</span>
          <span className="block text-[11px] text-[var(--color-muted)]">очков</span>
        </span>
      </div>

      <div className="px-4 pb-3">
        <div className="h-2 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{ width: `${Math.round(progress * 100)}%`, background: (next ?? rank).color }}
          />
        </div>
        <p className="mt-1.5 text-[12px] text-[var(--color-muted)]">
          {next
            ? `До ранга «${next.title}» — ${toNext.toLocaleString("ru-RU")} ${plural(toNext, "очко", "очка", "очков")}`
            : "Высший ранг. Дальше только серии и находки"}
        </p>
      </div>

      {/* Лестница рангов: видно, что будет дальше и сколько это стоит. */}
      <div className="flex gap-px bg-[var(--color-line)]">
        {RANKS.map((r) => {
          const reached = points >= r.from;
          const current = r.id === rank.id;
          return (
            <div
              key={r.id}
              className={`flex flex-1 flex-col items-center gap-1 px-1 py-2.5 ${
                current ? "bg-[var(--color-surface-2)]" : "bg-[var(--color-surface)]"
              }`}
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: reached ? r.color : "var(--color-line)" }}
              />
              <span className={`text-[11px] ${reached ? "font-bold" : "font-medium text-[var(--color-muted)]"}`}>
                {r.title}
              </span>
              <span className="tnum text-[10px] text-[var(--color-muted)]">
                {r.from === 0 ? "с начала" : `${r.from.toLocaleString("ru-RU")}+`}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[var(--color-line)] px-4 py-3">
        <span className="text-[13px] font-medium text-[var(--color-muted)]">
          Сегодня{" "}
          <span className="tnum font-bold text-[var(--color-ink)]">
            {stats.daySwipes} из {DAILY_GOAL}
          </span>
        </span>
        <span className="flex items-center gap-1 text-[13px] font-bold" title="Лайков подряд">
          <IconFlame className="h-4 w-4 text-[var(--color-brand)]" />
          <span className="tnum">{stats.streak}</span>
        </span>
      </div>

      <div className="grid grid-cols-3 gap-px border-t border-[var(--color-line)] bg-[var(--color-line)]">
        {[
          ["Просмотрено", stats.swipes],
          ["Понравилось", stats.likes],
          ["Лучшая серия", stats.bestStreak],
        ].map(([label, value]) => (
          <div key={String(label)} className="bg-[var(--color-surface)] px-2 py-3 text-center">
            <div className="tnum font-display text-[20px] font-bold leading-none">{value}</div>
            <div className="mt-1 text-[11px] leading-tight text-[var(--color-muted)]">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
