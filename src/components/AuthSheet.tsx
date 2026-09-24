"use client";

import { useEffect, useState } from "react";
import Sheet from "./Sheet";
import { Mark } from "./Brand";
import { toast } from "./Toast";
import { syncOnLogin } from "@/lib/sync";
import { useStore } from "@/lib/store";
import { PASSWORD_RULE, passwordProblem } from "@/lib/auth/rules";

type Mode = "login" | "register" | "forgot";

/**
 * Вход и регистрация. Регистрация не обязательна: приложение работает и без
 * неё, а учётная запись нужна ровно за тем, чтобы избранное, вишлист и корзина
 * жили не в одном браузере. Так и написано в форме — обещать больше нечего.
 */
export default function AuthSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const setAccount = useStore((s) => s.setAccount);
  const [mode, setMode] = useState<Mode>("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [name, setName] = useState("");
  /** Адрес, на который ушло письмо. Пока он есть — показываем экран ожидания. */
  const [awaiting, setAwaiting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setNote(null);
      setPassword("");
      setRepeat("");
      setAwaiting(null);
    }
  }, [open]);

  /** Запрос ссылки для смены пароля. Ответ одинаков и для known, и для unknown адреса. */
  async function requestReset() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/password/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Не получилось. Попробуйте ещё раз.");
        return;
      }
      setNote(data.message ?? "Если такой адрес зарегистрирован, письмо уже в пути.");
    } catch {
      setError("Сервер не отвечает");
    } finally {
      setBusy(false);
    }
  }

  /** Выслать письмо ещё раз — работает и до входа. */
  async function resend(address: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/verify/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: address }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok || !data.ok) setError(data.error ?? "Не получилось отправить письмо.");
      else setNote(data.message ?? "Письмо отправлено ещё раз.");
    } catch {
      setError("Сервер не отвечает");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (busy) return;
    if (mode === "forgot") return requestReset();
    if (mode === "register") {
      const bad = passwordProblem(password);
      if (bad) {
        setError(bad);
        return;
      }
      if (password !== repeat) {
        setError("Пароли не совпадают");
        return;
      }
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name: mode === "register" ? name : undefined }),
      });
      const data = (await res.json()) as {
        user?: { id: string; email: string; name?: string; createdAt: string; emailVerified?: boolean };
        pending?: boolean;
        email?: string;
        error?: string;
        unverified?: boolean;
        warning?: string | null;
        mailProblem?: string;
      };

      // Вход при неподтверждённой почте: показываем тот же экран ожидания, что
      // и после регистрации, — с кнопкой выслать письмо заново.
      if (res.status === 403 && data.unverified) {
        setAwaiting(email);
        setNote(data.error ?? "Почта не подтверждена.");
        return;
      }

      // Регистрация сессию не открывает: до подтверждения входить некуда.
      if (data.pending) {
        setAwaiting(data.email ?? email);
        if (data.warning) setWarning(data.warning);
        setNote(
          data.mailProblem
            ? `Аккаунт создан, но письмо отправить не удалось: ${data.mailProblem}. Попробуйте выслать ещё раз.`
            : null,
        );
        return;
      }

      if (!res.ok || !data.user) {
        setError(data.error ?? "Не получилось. Попробуйте ещё раз.");
        return;
      }

      setAccount(data.user);
      if (data.warning) setWarning(data.warning);
      // Первый вход на устройстве: объединяем локальное с тем, что в аккаунте.
      const outcome = await syncOnLogin();
      toast(outcome === "merged" ? "Данные аккаунта подтянулись" : "С возвращением", "like");
      if (!data.warning) onClose();
    } catch {
      setError("Сервер не отвечает");
    } finally {
      setBusy(false);
    }
  }

  // Письмо ушло — формы больше не нужно, нужна одна понятная инструкция.
  if (awaiting) {
    return (
      <Sheet open={open} title="Подтвердите почту" onClose={onClose}>
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-[var(--color-brand-soft)] px-4 py-3.5">
          <Mark className="h-8 w-8 shrink-0" id="auth-mark" />
          <p className="text-[13px] leading-snug text-[var(--color-ink-soft)]">
            Мы отправили письмо на <b className="break-all">{awaiting}</b>. Перейдите по ссылке из него — она
            и выполнит вход.
          </p>
        </div>

        <p className="mb-4 text-[13px] leading-relaxed text-[var(--color-muted)]">
          Письма нет? Загляните в папку со спамом — новые адреса туда попадают чаще обычного.
        </p>

        {error && (
          <p className="mb-3 rounded-2xl bg-[var(--color-nope-soft)] px-4 py-3 text-[13px] leading-snug text-[var(--color-nope)]">
            {error}
          </p>
        )}
        {note && (
          <p className="mb-3 rounded-2xl bg-[var(--color-like-soft)] px-4 py-3 text-[13px] leading-snug text-[var(--color-ink-soft)]">
            {note}
          </p>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={() => void resend(awaiting)}
          className="brand-gradient w-full rounded-2xl py-3.5 text-[15px] font-bold text-white disabled:opacity-50"
        >
          {busy ? "Отправляем…" : "Выслать письмо ещё раз"}
        </button>

        <button
          type="button"
          onClick={() => {
            setAwaiting(null);
            setNote(null);
            setError(null);
            setMode("login");
          }}
          className="mt-3 w-full py-2 text-[13px] font-semibold text-[var(--color-muted)] hover:text-[var(--color-ink)]"
        >
          Указать другой адрес
        </button>
      </Sheet>
    );
  }

  return (
    <Sheet
      open={open}
      title={mode === "register" ? "Регистрация" : mode === "login" ? "Вход" : "Восстановление пароля"}
      onClose={onClose}
    >
      <div className="mb-4 flex items-center gap-3 rounded-2xl bg-[var(--color-brand-soft)] px-4 py-3.5">
        <Mark className="h-8 w-8 shrink-0" id="auth-mark" />
        <p className="text-[13px] leading-snug text-[var(--color-ink-soft)]">
          {mode === "forgot"
            ? "Укажите почту, на которую регистрировались. Пришлём ссылку — по ней можно будет задать новый пароль."
            : "Аккаунт нужен, чтобы избранное, вишлист и корзина жили не в одном браузере. Без него всё работает как прежде."}
        </p>
      </div>

      {/* В режиме восстановления переключателю нечего показывать: ни одна из
          вкладок не активна, и он выглядит сломанным. Возврат — ссылкой внизу. */}
      {mode !== "forgot" && (
        <div className="mb-4 flex rounded-full bg-[var(--color-surface-2)] p-1">
          {(
          [
            ["register", "Регистрация"],
            ["login", "Вход"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setMode(id);
              setError(null);
              setNote(null);
            }}
            aria-pressed={mode === id}
            className={`flex-1 rounded-full py-2 text-[13px] font-bold transition-colors ${
              mode === id ? "bg-[var(--color-surface)] text-[var(--color-ink)] soft-shadow" : "text-[var(--color-muted)]"
            }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="flex flex-col gap-2.5"
      >
        {mode === "register" && (
          <label className="soft-shadow flex flex-col rounded-2xl bg-[var(--color-surface)] px-4 py-2.5">
            <span className="text-[12px] font-semibold text-[var(--color-muted)]">Как к вам обращаться</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="given-name"
              placeholder="Необязательно"
              className="bg-transparent py-1 text-[15px] outline-none placeholder:text-[var(--color-muted)]"
            />
          </label>
        )}

        <label className="soft-shadow flex flex-col rounded-2xl bg-[var(--color-surface)] px-4 py-2.5">
          <span className="text-[12px] font-semibold text-[var(--color-muted)]">Почта</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            className="bg-transparent py-1 text-[15px] outline-none placeholder:text-[var(--color-muted)]"
          />
        </label>

        {mode !== "forgot" && (
          <label className="soft-shadow flex flex-col rounded-2xl bg-[var(--color-surface)] px-4 py-2.5">
            <span className="text-[12px] font-semibold text-[var(--color-muted)]">
              Пароль{mode === "register" ? ` · ${PASSWORD_RULE}` : ""}
            </span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              minLength={mode === "register" ? 8 : undefined}
              className="bg-transparent py-1 text-[15px] outline-none"
            />
          </label>
        )}

        {mode === "register" && (
          <label className="soft-shadow flex flex-col rounded-2xl bg-[var(--color-surface)] px-4 py-2.5">
            <span className="text-[12px] font-semibold text-[var(--color-muted)]">Пароль ещё раз</span>
            <input
              type="password"
              required
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
              autoComplete="new-password"
              className="bg-transparent py-1 text-[15px] outline-none"
            />
            {repeat && password !== repeat && (
              <span className="pb-0.5 text-[12px] text-[var(--color-nope)]">Пароли не совпадают</span>
            )}
          </label>
        )}

        {error && (
          <p className="rounded-2xl bg-[var(--color-nope-soft)] px-4 py-3 text-[13px] leading-snug text-[var(--color-nope)]">
            {error}
          </p>
        )}

        {warning && (
          <p className="rounded-2xl bg-[var(--color-super-soft)] px-4 py-3 text-[13px] leading-snug text-[var(--color-ink-soft)]">
            {warning}
          </p>
        )}

        {note && (
          <p className="rounded-2xl bg-[var(--color-like-soft)] px-4 py-3 text-[13px] leading-snug text-[var(--color-ink-soft)]">
            {note}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="brand-gradient mt-1 rounded-2xl py-3.5 text-[15px] font-bold text-white disabled:opacity-50"
        >
          {busy
            ? "Секунду…"
            : mode === "register"
              ? "Создать аккаунт"
              : mode === "login"
                ? "Войти"
                : "Прислать ссылку"}
        </button>

        {mode !== "register" && (
          <button
            type="button"
            onClick={() => {
              setMode(mode === "forgot" ? "login" : "forgot");
              setError(null);
              setNote(null);
            }}
            className="mt-1 py-1 text-[13px] font-semibold text-[var(--color-muted)] hover:text-[var(--color-ink)]"
          >
            {mode === "forgot" ? "Вспомнил пароль — войти" : "Забыли пароль?"}
          </button>
        )}
      </form>

      <p className="mb-2 mt-4 text-center text-[12px] leading-snug text-[var(--color-muted)]">
        Пароль хранится только хэшем. Почту используем для входа, подтверждения адреса и восстановления
        пароля — и ни для чего больше.
      </p>
    </Sheet>
  );
}
