"use client";

import { useEffect, useState } from "react";
import AuthPageShell from "@/components/AuthPageShell";

type State = "ready" | "busy" | "done" | "error" | "notoken";

/**
 * Подтверждение по нажатию кнопки, а не по самому переходу: почтовые клиенты и
 * антивирусы открывают ссылки сами, и одноразовый токен сгорал бы до человека.
 */
export default function VerifyPage() {
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<State>("ready");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const found = new URLSearchParams(window.location.search).get("token");
    if (found) setToken(found);
    else setState("notoken");
  }, []);

  async function confirm() {
    if (!token || state === "busy") return;
    setState("busy");
    try {
      const res = await fetch("/api/auth/verify/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json()) as { ok?: boolean; email?: string; error?: string };
      if (!res.ok || !data.ok) {
        setMessage(data.error ?? "Не получилось. Попробуйте ещё раз.");
        setState("error");
        return;
      }
      setMessage(data.email ?? null);
      setState("done");
    } catch {
      setMessage("Сервер не отвечает");
      setState("error");
    }
  }

  if (state === "notoken") {
    return (
      <AuthPageShell title="Ссылка неполная">
        <p className="text-[14px] leading-relaxed text-[var(--color-ink-soft)]">
          В адресе нет кода подтверждения. Откройте ссылку из письма целиком — почтовые клиенты
          иногда обрезают длинные адреса.
        </p>
      </AuthPageShell>
    );
  }

  if (state === "done") {
    return (
      <AuthPageShell title="Почта подтверждена">
        <p className="text-[14px] leading-relaxed text-[var(--color-ink-soft)]">
          {message ? `Адрес ${message} подтверждён. ` : ""}
          Теперь пароль можно восстановить, если он забудется.
        </p>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell title="Подтвердите почту">
      <p className="mb-4 text-[14px] leading-relaxed text-[var(--color-ink-soft)]">
        Нажмите кнопку — и адрес будет привязан к вашей учётной записи.
      </p>
      {state === "error" && message && (
        <p className="mb-3 rounded-2xl bg-[var(--color-nope-soft)] px-4 py-3 text-[13px] leading-snug text-[var(--color-nope)]">
          {message}
        </p>
      )}
      <button
        type="button"
        onClick={() => void confirm()}
        disabled={state === "busy"}
        className="brand-gradient w-full rounded-2xl py-3.5 text-[15px] font-bold text-white disabled:opacity-50"
      >
        {state === "busy" ? "Секунду…" : "Подтвердить почту"}
      </button>
    </AuthPageShell>
  );
}
