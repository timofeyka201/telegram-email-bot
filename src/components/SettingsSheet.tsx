"use client";

import { useState } from "react";
import Sheet from "./Sheet";
import { Mark } from "./Brand";
import { IconAuto, IconChevron, IconExit, IconMoon, IconRuler, IconSun, IconTrash, IconUser } from "./Icons";
import AuthSheet from "./AuthSheet";
import InstallBlock from "./InstallBlock";
import SizeProfileSheet from "./SizeProfileSheet";
import { toast } from "./Toast";
import { needsConversion, symbolOf } from "@/lib/money";
import { hasSizes } from "@/lib/sizes";
import { flushPush } from "@/lib/sync";
import { useStore } from "@/lib/store";

const THEMES = [
  { id: "light", label: "Светлая", Icon: IconSun },
  { id: "dark", label: "Тёмная", Icon: IconMoon },
  { id: "system", label: "Как в системе", Icon: IconAuto },
] as const;

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
  const setRate = useStore((s) => s.setRate);
  const stats = useStore((s) => s.stats);
  const resetAll = useStore((s) => s.resetAll);
  const [confirmReset, setConfirmReset] = useState(false);
  const [sizesOpen, setSizesOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [verifySending, setVerifySending] = useState(false);
  const account = useStore((s) => s.account);
  const setAccount = useStore((s) => s.setAccount);
  const sizes = useStore((s) => s.sizes);

  const cart = useStore((s) => s.cart);
  const liked = useStore((s) => s.liked);
  // Курс нужен только для валют, которые реально встречаются у пользователя.
  const currencies = [
    ...new Set([baseCurrency, ...cart.map((c) => c.product.currency), ...liked.map((p) => p.currency)]),
  ].filter((c): c is string => !!c && needsConversion(c));

  return (
    <Sheet open={open} title="Настройки" onClose={onClose}>
      <p className="mb-2 mt-1 text-[12px] font-bold uppercase tracking-wider text-[var(--color-muted)]">Аккаунт</p>
      {account ? (
        <div className="soft-shadow flex items-center gap-3 rounded-2xl bg-[var(--color-surface)] px-4 py-3.5">
          <span className="brand-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
            <IconUser className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-semibold">{account.name || account.email}</span>
            <span className="block truncate text-[12px] text-[var(--color-muted)]">
              {account.name ? account.email : "Избранное и корзина синхронизируются"}
            </span>
          </span>
          <button
            type="button"
            aria-label="Выйти"
            title="Выйти"
            onClick={async () => {
              // Локальные данные не трогаем: выход — не удаление.
              await flushPush();
              await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
              setAccount(null);
              toast("Вы вышли");
            }}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface-2)] text-[var(--color-muted)]"
          >
            <IconExit className="h-5 w-5" />
          </button>
        </div>
      ) : null}

      {account && account.emailVerified === false && (
        <div className="mt-2 rounded-2xl bg-[var(--color-super-soft)] px-4 py-3">
          <p className="text-[13px] leading-snug text-[var(--color-ink-soft)]">
            Почта не подтверждена. Без этого не получится восстановить пароль, если он забудется.
          </p>
          <button
            type="button"
            disabled={verifySending}
            onClick={async () => {
              setVerifySending(true);
              try {
                const res = await fetch("/api/auth/verify/send", { method: "POST" });
                const data = (await res.json()) as { ok?: boolean; error?: string };
                toast(
                  data.ok ? "Письмо отправлено — проверьте почту" : (data.error ?? "Не получилось отправить"),
                  data.ok ? "like" : "warn",
                );
              } catch {
                toast("Сервер не отвечает", "warn");
              } finally {
                setVerifySending(false);
              }
            }}
            className="mt-2 rounded-xl bg-[var(--color-surface)] px-3.5 py-2 text-[13px] font-bold text-[var(--color-ink)] disabled:opacity-50"
          >
            {verifySending ? "Отправляем…" : "Выслать письмо ещё раз"}
          </button>
        </div>
      )}

      {!account && (
        <button
          type="button"
          onClick={() => setAuthOpen(true)}
          className="soft-shadow flex w-full items-center gap-3 rounded-2xl bg-[var(--color-surface)] px-4 py-3.5 text-left"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
            <IconUser className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold">Войти или зарегистрироваться</span>
            <span className="block text-[12px] leading-snug text-[var(--color-muted)]">
              Чтобы списки не остались в одном браузере
            </span>
          </span>
          <IconChevron className="h-5 w-5 shrink-0 text-[var(--color-muted)]" />
        </button>
      )}

      <InstallBlock />

      <p className="mb-2 mt-6 text-[12px] font-bold uppercase tracking-wider text-[var(--color-muted)]">Оформление</p>
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
          <div className="soft-shadow space-y-2 rounded-2xl bg-[var(--color-surface)] px-4 py-3.5">
            {currencies.map((c) => (
              <label key={c} className="flex items-center gap-3">
                <span className="w-14 text-[14px] font-semibold">1 {symbolOf(c)} =</span>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={rates[c]}
                  onChange={(e) => setRate(c, Number(e.target.value))}
                  className="tnum flex-1 rounded-xl bg-[var(--color-surface-2)] px-3 py-2 text-[15px] outline-none"
                />
                <span className="text-[14px] text-[var(--color-muted)]">₽</span>
              </label>
            ))}
            <p className="pt-1 text-[12px] leading-snug text-[var(--color-muted)]">
              Курсы задаются вручную. Доставка и комиссии в расчёт не входят.
            </p>
          </div>
        </>
      )}

      <p className="mb-2 mt-6 text-[12px] font-bold uppercase tracking-wider text-[var(--color-muted)]">Профиль</p>
      <button
        type="button"
        onClick={() => setSizesOpen(true)}
        className="soft-shadow flex w-full items-center gap-3 rounded-2xl bg-[var(--color-surface)] px-4 py-3.5 text-left"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
          <IconRuler className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold">Мои размеры</span>
          <span className="block truncate text-[12px] text-[var(--color-muted)]">
            {hasSizes(sizes)
              ? [sizes.clothing && `одежда ${sizes.clothing}`, sizes.shoes && `обувь ${sizes.shoes}`, sizes.height && `рост ${sizes.height}`]
                  .filter(Boolean)
                  .join(" · ") || "заполнено"
              : "Не заполнено — гайд по размерам подскажет ваш"}
          </span>
        </span>
        <IconChevron className="h-5 w-5 shrink-0 text-[var(--color-muted)]" />
      </button>

      <p className="mb-2 mt-6 text-[12px] font-bold uppercase tracking-wider text-[var(--color-muted)]">Статистика</p>
      <div className="soft-shadow grid grid-cols-3 gap-px overflow-hidden rounded-2xl bg-[var(--color-line)]">
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

      {catalogSize > 0 && (
        <>
          <p className="mb-2 mt-6 text-[12px] font-bold uppercase tracking-wider text-[var(--color-muted)]">Витрина</p>
          <div className="soft-shadow flex items-center gap-3 rounded-2xl bg-[var(--color-surface)] px-4 py-3.5">
            <Mark className="h-8 w-8 shrink-0" id="set-mark" />
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold">{sourceLabel || "Своя база"}</p>
              <p className="tnum text-[12px] text-[var(--color-muted)]">{catalogSize} карточек</p>
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
        {confirmReset ? "Точно очистить? Нажмите ещё раз" : "Очистить избранное, корзину и статистику"}
      </button>

      <p className="mb-2 mt-6 text-center text-[12px] text-[var(--color-muted)]">Swiper · витрина со свайпами</p>

      <SizeProfileSheet open={sizesOpen} onClose={() => setSizesOpen(false)} />
      <AuthSheet open={authOpen} onClose={() => setAuthOpen(false)} />
    </Sheet>
  );
}
