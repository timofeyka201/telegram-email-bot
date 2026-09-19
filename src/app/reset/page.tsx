"use client";

import { useEffect, useState } from "react";
import AuthPageShell from "@/components/AuthPageShell";
import { useStore } from "@/lib/store";

type State = "ready" | "busy" | "done" | "notoken";

export default function ResetPage() {
  const setAccount = useStore((s) => s.setAccount);
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [state, setState] = useState<State>("ready");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const found = new URLSearchParams(window.location.search).get("token");
    if (found) setToken(found);
    else setState("notoken");
  }, []);

  async function submit() {
    if (!token || state === "busy") return;
    if (password !== repeat) {
      setError("Пароли не совпадают");
      return;
    }
    setState("busy");
    setError(null);
    try {
      const res = await fetch("/api/auth/password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = (await res.json()) as {
        user?: { id: string; email: string; name?: string; createdAt: string; emailVerified: boolean };
        error?: string;
      };
      if (!res.ok || !data.user) {
        setError(data.error ?? "Не получилось. Попробуйте ещё раз.");
        setState("ready");
        return;
      }
      // Сервер уже открыл новую сессию — можно сразу пользоваться приложением.
      setAccount(data.user);
      setState("done");
    } catch {
      setError("Сервер не отвечает");
      setState("ready");
    }
  }

  if (state === "notoken") {
    return (
      <AuthPageShell title="Ссылка неполная">
        <p className="text-[14px] leading-relaxed text-[var(--color-ink-soft)]">
          В адресе нет кода. Откройте ссылку из письма целиком — почтовые клиенты иногда обрезают
          длинные адреса.
        </p>
      </AuthPageShell>
    );
  }

  if (state === "done") {
    return (
      <AuthPageShell title="Пароль изменён">
        <p className="text-[14px] leading-relaxed text-[var(--color-ink-soft)]">
          Вы уже вошли с новым паролем. На других устройствах придётся войти заново — старые входы
          мы погасили.
        </p>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell title="Новый пароль">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="flex flex-col gap-2.5"
      >
        <label className="soft-shadow flex flex-col rounded-2xl bg-[var(--color-surface-2)] px-4 py-2.5">
          <span className="text-[12px] font-semibold text-[var(--color-muted)]">Пароль · от 8 символов</span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            className="bg-transparent py-1 text-[15px] outline-none"
          />
        </label>

        <label className="soft-shadow flex flex-col rounded-2xl bg-[var(--color-surface-2)] px-4 py-2.5">
          <span className="text-[12px] font-semibold text-[var(--color-muted)]">Ещё раз</span>
          <input
            type="password"
            required
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            autoComplete="new-password"
            className="bg-transparent py-1 text-[15px] outline-none"
          />
        </label>

        {error && (
          <p className="rounded-2xl bg-[var(--color-nope-soft)] px-4 py-3 text-[13px] leading-snug text-[var(--color-nope)]">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={state === "busy"}
          className="brand-gradient mt-1 rounded-2xl py-3.5 text-[15px] font-bold text-white disabled:opacity-50"
        >
          {state === "busy" ? "Секунду…" : "Сохранить пароль"}
        </button>
      </form>
      <p className="mt-4 text-center text-[12px] leading-snug text-[var(--color-muted)]">
        После смены пароля входы на других устройствах закроются.
      </p>
    </AuthPageShell>
  );
}
