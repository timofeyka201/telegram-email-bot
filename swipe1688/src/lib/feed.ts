"use client";

import { useStore } from "./store";
import type { FeedPage } from "./types";

/**
 * Загрузка следующей страницы ленты. Единая точка для панели подбора и для
 * фоновой дозагрузки в колоде, поэтому здесь же защита от параллельных вызовов.
 */
let inFlight: Promise<{ ok: boolean; error?: string }> | null = null;

export function isLoadingFeed(): boolean {
  return inFlight !== null;
}

export function loadNextPage(): Promise<{ ok: boolean; error?: string }> {
  if (inFlight) return inFlight;

  const { provider, query, cursor, seed, appendPage } = useStore.getState();

  inFlight = (async () => {
    try {
      const res = await fetch("/api/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, query, cursor, seed }),
      });
      const data = (await res.json()) as FeedPage & { error?: string; problems?: string[] };
      if (!res.ok || !data.products?.length) {
        const detail = data.problems?.length ? ` (${data.problems.join("; ")})` : "";
        return { ok: false, error: (data.error || "Источник не ответил") + detail };
      }
      appendPage(data.products, data.cursor, data.provider, data.providerLabel);
      return { ok: true };
    } catch {
      return { ok: false, error: "Не удалось связаться с сервером" };
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
