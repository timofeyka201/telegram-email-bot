"use client";

import { useEffect } from "react";
import { pullProfile, startSyncAgent, syncOnLogin } from "@/lib/sync";
import { useHydrated, useStore } from "@/lib/store";

/**
 * Держит связь с сервером: при запуске выясняет, кто вошёл, подтягивает
 * профиль и курс валют, дальше отправляет изменения. Ничего не рисует.
 */
export default function SyncAgent() {
  const hydrated = useHydrated();
  const account = useStore((s) => s.account);
  const setAccount = useStore((s) => s.setAccount);

  // Сессия живёт в куке, поэтому источник правды о входе — сервер.
  useEffect(() => {
    if (!hydrated) return;
    let alive = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then(
        (d: {
          user: { id: string; email: string; name?: string; createdAt: string; emailVerified?: boolean } | null;
        }) => {
        if (!alive) return;
        const current = useStore.getState().account;
        if (d.user) {
          // Тот же аккаунт — обычное возобновление; другой или первый вход с
          // этого устройства — слияние, иначе локальные данные затрут аккаунт.
          const isSame = current?.id === d.user.id;
          // Запись обновляем всегда: подтвердить почту могли в другой вкладке.
          if (!isSame || current?.emailVerified !== d.user.emailVerified) setAccount(d.user);
          void (isSame ? pullProfile() : syncOnLogin());
        } else if (current) {
          // Сессия истекла: данные оставляем, но перестаём их отправлять.
          setAccount(null);
        }
        },
      )
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [hydrated, setAccount]);

  // Курс общий для всех и в аккаунте не нуждается, поэтому спрашиваем его
  // отдельно и при каждом запуске: браузер всё равно ответит из своего кэша,
  // пока полученному значению не исполнится полчаса.
  useEffect(() => {
    if (!hydrated) return;
    let alive = true;
    fetch("/api/rates")
      .then((r) => r.json())
      .then((d: { rates?: Record<string, number>; date?: string | null; source?: string }) => {
        if (!alive || !d.rates || !Object.keys(d.rates).length) return;
        useStore.getState().setRates(d.rates, { date: d.date ?? null, source: d.source ?? "ЦБ РФ" });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [hydrated]);

  useEffect(() => {
    if (!account) return;
    return startSyncAgent();
  }, [account]);

  return null;
}
