"use client";

import { useState } from "react";
import AuthSheet from "./AuthSheet";
import { IconChevron, IconExit, IconUser } from "./Icons";
import { toast } from "./Toast";
import { flushPush } from "@/lib/sync";
import { useStore } from "@/lib/store";

/**
 * Аккаунт: вход, выход и напоминание подтвердить почту.
 *
 * Жил внутри шторки настроек — то есть за двумя нажатиями от ленты, в разделе
 * про тему и курс валют. Это настройки сервиса, а вход — про человека, поэтому
 * блок переехал в «Профиль», наверх, где его и ищут.
 */
export default function AccountCard() {
  const account = useStore((s) => s.account);
  const setAccount = useStore((s) => s.setAccount);
  const [authOpen, setAuthOpen] = useState(false);
  const [verifySending, setVerifySending] = useState(false);

  return (
    <>
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
      ) : (
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

      <AuthSheet open={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  );
}
