"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AccountCard from "@/components/AccountCard";
import Img from "@/components/Img";
import RankCard from "@/components/RankCard";
import SettingsSheet from "@/components/SettingsSheet";
import SizeProfileSheet from "@/components/SizeProfileSheet";
import { IconBox, IconChevron, IconExternal, IconGear, IconPhone, IconRuler, IconTrash, IconUser } from "@/components/Icons";
import { formatRub, plural } from "@/lib/money";
import { hasSizes } from "@/lib/sizes";
import { useHydrated, useStore } from "@/lib/store";

/**
 * Профиль: всё про человека на одной странице.
 *
 * До этого личное было рассыпано: счётчики жили в шапке ленты, размеры и вход
 * — в шторке настроек, а имени с телефоном не было вовсе. Теперь раздел один
 * и порядок в нём от частого к редкому: кто вы, какой у вас ранг, ваши данные,
 * размеры, заказы. Настройки сервиса остались шторкой — за значком в углу:
 * тему и курс валют открывают раз в жизни.
 */
export default function ProfilePage() {
  const hydrated = useHydrated();
  const person = useStore((s) => s.person);
  const setPerson = useStore((s) => s.setPerson);
  const sizes = useStore((s) => s.sizes);
  const orders = useStore((s) => s.orders);
  const forgetOrder = useStore((s) => s.forgetOrder);
  const rates = useStore((s) => s.rates);
  const providerLabel = useStore((s) => s.providerLabel);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sizesOpen, setSizesOpen] = useState(false);
  const [catalog, setCatalog] = useState<{ size: number; currency: string }>({ size: 0, currency: "RUB" });

  // Настройкам нужны размер витрины и её валюта: раньше их приносила лента,
  // но шторка переехала сюда вместе с кнопкой.
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d: { facets?: { currency?: string }; catalog?: { total?: number } }) =>
        setCatalog({ size: d.catalog?.total ?? 0, currency: d.facets?.currency ?? "RUB" }),
      )
      .catch(() => undefined);
  }, []);

  if (!hydrated) return <div className="flex-1" />;

  return (
    <div className="flex flex-1 flex-col pb-6">
      <header className="safe-top sticky top-0 z-30 flex items-center justify-between bg-[var(--color-bg)]/92 px-4 py-3 backdrop-blur-md">
        <h1 className="font-display text-[28px] leading-none">Профиль</h1>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="Настройки"
          className="soft-shadow flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-surface)] text-[var(--color-ink)]"
        >
          <IconGear className="h-5 w-5" />
        </button>
      </header>

      <div className="space-y-6 px-4">
        <section>
          <AccountCard />
        </section>

        <section>
          <Caption>Ранг</Caption>
          <RankCard />
        </section>

        <section>
          <Caption>Личные данные</Caption>
          <div className="soft-shadow space-y-2.5 rounded-[var(--radius-tile)] bg-[var(--color-surface)] px-4 py-4">
            <Field
              label="Имя"
              value={person.firstName}
              placeholder="Анна"
              autoComplete="given-name"
              onChange={(firstName) => setPerson({ firstName })}
            />
            <Field
              label="Фамилия"
              value={person.lastName}
              placeholder="Иванова"
              autoComplete="family-name"
              onChange={(lastName) => setPerson({ lastName })}
            />
            <Field
              label="Телефон"
              value={person.phone}
              placeholder="+7 900 000-00-00"
              autoComplete="tel"
              type="tel"
              icon
              // Пускаем только то, из чего состоит номер: буквы в телефоне —
              // всегда опечатка, а формат у всех свой, и навязывать его незачем.
              onChange={(phone) => setPerson({ phone: phone.replace(/[^\d+\-()\s]/g, "").slice(0, 24) })}
            />
            <p className="pt-0.5 text-[12px] leading-snug text-[var(--color-muted)]">
              Данные остаются у вас: при входе они едут в аккаунт, чтобы не пропасть со сменой телефона.
              Заказ оформляется на стороне магазина, и туда мы их не передаём.
            </p>
          </div>
        </section>

        <section>
          <Caption>Размеры</Caption>
          <button
            type="button"
            onClick={() => setSizesOpen(true)}
            className="soft-shadow flex w-full items-center gap-3 rounded-[var(--radius-tile)] bg-[var(--color-surface)] px-4 py-3.5 text-left"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
              <IconRuler className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold">Мои размеры</span>
              <span className="block truncate text-[12px] text-[var(--color-muted)]">
                {hasSizes(sizes)
                  ? [
                      sizes.clothing && `одежда ${sizes.clothing}`,
                      sizes.shoes && `обувь ${sizes.shoes}`,
                      sizes.height && `рост ${sizes.height}`,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "заполнено"
                  : "Не заполнено — гайд по размерам подскажет ваш"}
              </span>
            </span>
            <IconChevron className="h-5 w-5 shrink-0 text-[var(--color-muted)]" />
          </button>
        </section>

        <section>
          <Caption>
            Заказы
            {orders.length > 0 && <span className="tnum ml-1 text-[var(--color-muted)]">· {orders.length}</span>}
          </Caption>
          {orders.length === 0 ? (
            <div className="soft-shadow rounded-[var(--radius-tile)] bg-[var(--color-surface)] px-4 py-5 text-center">
              <span className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-[var(--color-muted)]">
                <IconBox className="h-6 w-6" />
              </span>
              <p className="text-[14px] font-semibold">Пока пусто</p>
              <p className="mx-auto mt-1 max-w-[280px] text-[12px] leading-snug text-[var(--color-muted)]">
                {/* Честно про то, чего витрина не знает: своих заказов у неё нет. */}
                Здесь появятся товары, за которыми вы ушли в магазин. Сам заказ оформляется на
                {providerLabel ? ` ${providerLabel}` : " стороне продавца"} — его состояние видно там же, в
                вашем аккаунте магазина.
              </p>
              <Link
                href="/cart"
                className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[var(--color-surface-2)] px-4 py-2 text-[13px] font-semibold"
              >
                Открыть корзину
              </Link>
            </div>
          ) : (
            <ul className="soft-shadow divide-y divide-[var(--color-line)] overflow-hidden rounded-[var(--radius-tile)] bg-[var(--color-surface)]">
              {orders.map((o) => (
                <li key={o.id} className="flex items-center gap-3 px-3 py-2.5">
                  <Img
                    src={o.image}
                    alt={o.title}
                    className="h-14 w-14 shrink-0 rounded-xl"
                    fallbackLabel={o.title.slice(0, 20)}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[13px] font-semibold leading-snug">{o.title}</p>
                    <p className="tnum mt-0.5 text-[12px] text-[var(--color-muted)]">
                      {formatRub(o.price, o.currency, rates)} ·{" "}
                      {new Date(o.at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                    </p>
                  </div>
                  <a
                    href={`/api/go/${encodeURIComponent(o.id)}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    aria-label="Открыть в магазине"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface-2)] text-[var(--color-ink-soft)]"
                  >
                    <IconExternal className="h-[18px] w-[18px]" />
                  </a>
                  <button
                    type="button"
                    onClick={() => forgetOrder(o.id)}
                    aria-label="Убрать из списка"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[var(--color-muted)]"
                  >
                    <IconTrash className="h-[18px] w-[18px]" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        sourceLabel={providerLabel}
        catalogSize={catalog.size}
        baseCurrency={catalog.currency}
      />
      <SizeProfileSheet open={sizesOpen} onClose={() => setSizesOpen(false)} />
    </div>
  );
}

function Caption({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[12px] font-bold uppercase tracking-wider text-[var(--color-muted)]">{children}</p>
  );
}

/**
 * Поле личных данных. Сохраняется сразу, без кнопки «Сохранить»: кнопка тут
 * означала бы, что набранное можно потерять, уйдя со страницы, — а отправку в
 * облако всё равно откладывает синхронизация.
 */
function Field({
  label,
  value,
  placeholder,
  autoComplete,
  type = "text",
  icon,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  autoComplete: string;
  type?: string;
  icon?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-[var(--color-muted)]">
        {icon ? <IconPhone className="h-3.5 w-3.5" /> : <IconUser className="h-3.5 w-3.5" />}
        {label}
      </span>
      <input
        type={type}
        inputMode={type === "tel" ? "tel" : undefined}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl bg-[var(--color-surface-2)] px-3.5 py-2.5 text-[15px] outline-none focus:ring-2 focus:ring-[var(--color-brand)]"
      />
    </label>
  );
}
