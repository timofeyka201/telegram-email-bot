"use client";

import { useStore } from "./store";
import { toHint } from "./taste";
import type { FeedPage } from "./types";

/**
 * Загрузка следующей страницы ленты. Единая точка для панели подбора и для
 * фоновой дозагрузки в колоде, поэтому здесь же защита от параллельных вызовов.
 */
let inFlight: Promise<{ ok: boolean; error?: string }> | null = null;

export function isLoadingFeed(): boolean {
  return inFlight !== null;
}

/**
 * Сколько страниц подряд пробовать, если каждая приходит целиком из уже
 * показанного. Такое случается на стыке кругов и после смены фильтров;
 * раньше каждая такая страница была отдельным походом за данными — с паузой
 * и надписью «подбираем следующие карточки» между ними.
 */
const MAX_TRIES = 4;

export function loadNextPage(): Promise<{ ok: boolean; error?: string }> {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      let last: { ok: boolean; error?: string } = { ok: true };
      for (let tries = 0; tries < MAX_TRIES; tries++) {
        // Состояние перечитываем на каждом заходе: курсор сдвинулся, да и
        // человек мог успеть свайпнуть.
        const { provider, query, cursor, seed, filters, taste, rejected, seen, rates, appendPage } =
          useStore.getState();
        // Исключаем всё, что уже показывали: и отвергнутое, и просто
        // просмотренное. Иначе после перезапуска сессии витрина начинает
        // предлагать по второму разу то, что человек уже видел.
        const hint = toHint(taste, [...new Set([...seen, ...rejected])], rates);

        const res = await fetch("/api/feed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, query, cursor, seed, filters, hint }),
        });
        const data = (await res.json()) as FeedPage & { error?: string; problems?: string[] };
        if (!res.ok || !data.products?.length) {
          const detail = data.problems?.length ? ` (${data.problems.join("; ")})` : "";
          return { ok: false, error: (data.error || "Источник не ответил") + detail };
        }

        const before = useStore.getState().deck.length;
        appendPage(data.products, data.cursor, data.provider, data.providerLabel);
        last = { ok: true };
        // Страница целиком из уже виденного — колода не выросла, идём дальше.
        if (useStore.getState().deck.length > before) return last;
      }
      return last;
    } catch {
      return { ok: false, error: "Не удалось связаться с сервером" };
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
