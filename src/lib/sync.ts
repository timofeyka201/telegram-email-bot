"use client";

import { useStore, type SyncedProfile } from "./store";

/**
 * Синхронизация личных данных с сервером. Работает только при входе; гость
 * живёт целиком в браузере, как и раньше.
 *
 * Конфликты решаются по-разному в двух разных ситуациях, и это важно:
 *
 *  • Возобновление сессии — побеждает более свежая сторона целиком. Слияние
 *    здесь воскрешало бы только что удалённое.
 *
 *  • Первый вход на устройстве — списки объединяются. Правило «свежее
 *    побеждает» тут нельзя: любое действие в приложении до входа (даже
 *    пропуск теста вкусов) делает пустое устройство «свежее» аккаунта, и
 *    данные пользователя стираются.
 */
const PUSH_DELAY = 2500;

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pushing: Promise<void> | null = null;
let started = false;

async function push(): Promise<void> {
  const { account, exportProfile } = useStore.getState();
  if (!account) return;
  const profile = exportProfile();
  try {
    await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile, updatedAt: profile.updatedAt || Date.now() }),
    });
  } catch {
    /* сеть пропала — отправим при следующем изменении */
  }
}

export function schedulePush(): void {
  if (!useStore.getState().account) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushing = push().finally(() => {
      pushing = null;
    });
  }, PUSH_DELAY);
}

export async function flushPush(): Promise<void> {
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
    await push();
  }
  if (pushing) await pushing;
}

async function fetchRemote(): Promise<SyncedProfile | null | "error"> {
  try {
    const res = await fetch("/api/sync", { cache: "no-store" });
    if (!res.ok) return "error";
    const { profile } = (await res.json()) as { profile: SyncedProfile | null };
    return profile;
  } catch {
    return "error";
  }
}

const byId = <T extends { id: string }>(a: T[], b: T[]): T[] => {
  const out = [...a];
  const seen = new Set(a.map((x) => x.id));
  for (const item of b) if (!seen.has(item.id)) out.push(item);
  return out;
};

/** Объединение профилей: ничего не теряем, спорные скаляры берём у свежего. */
function merge(local: SyncedProfile, remote: SyncedProfile): SyncedProfile {
  const remoteNewer = (remote.updatedAt ?? 0) >= (local.updatedAt ?? 0);
  const fresh = remoteNewer ? remote : local;
  const stale = remoteNewer ? local : remote;

  const weights = (a: Record<string, number> = {}, b: Record<string, number> = {}) => {
    const out: Record<string, number> = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = Math.max(-8, Math.min(8, (out[k] ?? 0) + v));
    return out;
  };

  return {
    liked: byId(remote.liked ?? [], local.liked ?? []),
    wishlist: byId(remote.wishlist ?? [], local.wishlist ?? []),
    cart: (() => {
      const out = [...(remote.cart ?? [])];
      const ids = new Set(out.map((c) => c.product.id));
      for (const c of local.cart ?? []) if (!ids.has(c.product.id)) out.push(c);
      return out;
    })(),
    rejected: [...new Set([...(remote.rejected ?? []), ...(local.rejected ?? [])])].slice(0, 2000),
    watch: { ...(local.watch ?? {}), ...(remote.watch ?? {}) },
    taste: {
      picked: fresh.taste?.picked?.length ? fresh.taste.picked : (stale.taste?.picked ?? []),
      budget: fresh.taste?.budget ?? stale.taste?.budget,
      categories: weights(remote.taste?.categories, local.taste?.categories),
      brands: weights(remote.taste?.brands, local.taste?.brands),
      reasons: weights(remote.taste?.reasons, local.taste?.reasons),
    },
    sizes: Object.keys(fresh.sizes ?? {}).length ? fresh.sizes : (stale.sizes ?? {}),
    stats: {
      ...fresh.stats,
      swipes: Math.max(local.stats?.swipes ?? 0, remote.stats?.swipes ?? 0),
      likes: Math.max(local.stats?.likes ?? 0, remote.stats?.likes ?? 0),
      bestStreak: Math.max(local.stats?.bestStreak ?? 0, remote.stats?.bestStreak ?? 0),
    },
    rates: { ...(stale.rates ?? {}), ...(fresh.rates ?? {}) },
    tasted: (local.tasted ?? false) || (remote.tasted ?? false),
    updatedAt: Date.now(),
  };
}

/**
 * Первый вход на устройстве: объединяем то, что человек уже успел здесь
 * насвайпать, с тем, что лежит в аккаунте.
 */
export async function syncOnLogin(): Promise<"merged" | "pushed" | "none"> {
  const state = useStore.getState();
  if (!state.account) return "none";

  const remote = await fetchRemote();
  if (remote === "error") return "none";
  if (!remote) {
    await push();
    return "pushed";
  }

  state.importProfile(merge(state.exportProfile(), remote));
  await push();
  return "merged";
}

/** Возобновление сессии: побеждает более свежая сторона целиком. */
export async function pullProfile(): Promise<"pulled" | "pushed" | "none"> {
  const state = useStore.getState();
  if (!state.account) return "none";

  const remote = await fetchRemote();
  if (remote === "error") return "none";
  if (!remote) {
    await push();
    return "pushed";
  }
  if ((remote.updatedAt ?? 0) > state.updatedAt) {
    state.importProfile(remote);
    return "pulled";
  }
  await push();
  return "pushed";
}

/** Подписка на изменения: любое движение личных данных откладывает отправку. */
export function startSyncAgent(): () => void {
  if (started) return () => undefined;
  started = true;

  const unsubscribe = useStore.subscribe((state, prev) => {
    if (!state.account) return;
    if (state.updatedAt !== prev.updatedAt) schedulePush();
  });

  const onHide = () => {
    if (document.visibilityState === "hidden") void flushPush();
  };
  document.addEventListener("visibilitychange", onHide);

  return () => {
    unsubscribe();
    document.removeEventListener("visibilitychange", onHide);
    started = false;
  };
}
