"use client";

import { useState } from "react";
import Sheet from "./Sheet";
import { Mark } from "./Brand";
import { IconAuto, IconMoon, IconSun, IconTrash } from "./Icons";
import InstallBlock from "./InstallBlock";
import { toast } from "./Toast";
import { formatRate, needsConversion, plural, rateFor, symbolOf } from "@/lib/money";
import { useStore } from "@/lib/store";

const THEMES = [
  { id: "light", label: "Светлая", Icon: IconSun },
  { id: "dark", label: "Тёмная", Icon: IconMoon },
  { id: "system", label: "Как в системе", Icon: IconAuto },
] as const;

/**
 * Настройки сервиса — и только они: тема, курс пересчёта, витрина, установка
 * на домашний экран, очистка.
 *
 * Вход, размеры и статистика отсюда переехали в раздел «Профиль». Они жили
 * здесь потому, что складывать их было больше некуда, и шторка настроек
 * получалась главной страницей о человеке — за двумя нажатиями от ленты и
 * вперемешку с выбором темы.
 */
export default function SettingsSheet({
  open,
  onClose,
  sourceLabel,
  catalogSize,
  baseCurrency,
}: {
  open: boolean;
  onClose: () => void;
  sourceLabel: string;
  catalogSize: number;
  baseCurrency?: string;
}) {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const rates = useStore((s) => s.rates);
  const rateInfo = useStore((s) => s.rateInfo);
  const resetAll = useStore((s) => s.resetAll);
  const [confirmReset, setConfirmReset] = useState(false);

  const cart = useStore((s) => s.cart);
  const liked = useStore((s) => s.liked);
  // Курс нужен только для валют, которые реально встречаются у пользователя.
  const currencies = [
    ...new Set([baseCurrency, ...cart.map((c) => c.product.currency), ...liked.map((p) => p.currency)]),
  ].filter((c): c is string => !!c && needsConversion(c));

  return (
    <Sheet open={open} title="Настройки" onClose={onClose}>
      <InstallBlock />

      <p className="mb-2 mt-2 text-[12px] font-bold uppercase tracking-wider text-[var(--color-muted)]">Оформление</p>
      <div className="grid grid-cols-3 gap-2">
        {THEMES.map(({ id, label, Icon }) => {
          const on = theme === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTheme(id)}
              aria-pressed={on}
              className={`flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 transition-colors ${
                on
                  ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)] text-[var(--color-brand)]"
                  : "border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-soft)]"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[12px] font-semibold leading-tight">{label}</span>
            </button>
          );
        })}
      </div>

      {currencies.length > 0 && (
        <>
          <p className="mb-2 mt-6 text-[12px] font-bold uppercase tracking-wider text-[var(--color-muted)]">
            Курс пересчёта в рубли
          </p>
          {/* Раньше курс вводили руками, и он устаревал в тот же день. Теперь
              приложение берёт его у Центробанка, а здесь остаётся справка. */}
          <div className="soft-shadow space-y-1.5 rounded-2xl bg-[var(--color-surface)] px-4 py-3.5">
            {currencies.map((c) => (
              <div key={c} className="flex items-baseline justify-between gap-3">
                <span className="text-[14px] font-semibold">1 {symbolOf(c)}</span>
                <span className="tnum text-[15px] font-bold">{formatRate(rateFor(c, rates))} ₽</span>
              </div>
            ))}
            <p className="pt-1 text-[12px] leading-snug text-[var(--color-muted)]">
              {rateInfo?.date
                ? `Курс ${rateInfo.source} на ${new Date(rateInfo.date).toLocaleDateString("ru-RU")}, обновляется сам.`
                : "Курс подтягивается сам, из Центробанка."}{" "}
              Доставка и комиссии в расчёт не входят.
            </p>
          </div>
        </>
      )}

      {catalogSize > 0 && (
        <>
          <p className="mb-2 mt-6 text-[12px] font-bold uppercase tracking-wider text-[var(--color-muted)]">Витрина</p>
          <div className="soft-shadow flex items-center gap-3 rounded-2xl bg-[var(--color-surface)] px-4 py-3.5">
            <Mark className="h-8 w-8 shrink-0" id="set-mark" />
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold">{sourceLabel || "Своя база"}</p>
              <p className="tnum text-[12px] text-[var(--color-muted)]">
                {/* Пять цифр подряд читаются плохо, а «21 карточек» — ещё хуже. */}
                {catalogSize.toLocaleString("ru-RU")} {plural(catalogSize, "карточка", "карточки", "карточек")}
              </p>
            </div>
          </div>
        </>
      )}

      <button
        type="button"
        onClick={() => {
          if (!confirmReset) {
            setConfirmReset(true);
            return;
          }
          resetAll();
          setConfirmReset(false);
          onClose();
          toast("Всё очищено");
        }}
        className={`mt-6 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-semibold transition-colors ${
          confirmReset
            ? "bg-[var(--color-nope)] text-white"
            : "bg-[var(--color-surface)] text-[var(--color-nope)] soft-shadow"
        }`}
      >
        <IconTrash className="h-4.5 w-4.5" />
        {confirmReset ? "Точно очистить? Нажмите ещё раз" : "Очистить списки, заказы и статистику"}
      </button>

      <p className="mb-2 mt-6 text-center text-[12px] text-[var(--color-muted)]">Swiper · витрина со свайпами</p>
    </Sheet>
  );
}
