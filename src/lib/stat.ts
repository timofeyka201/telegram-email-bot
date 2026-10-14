"use client";

/**
 * Отправка событий с телефона.
 *
 * Правила простые: не мешать ленте и не терять то, что успели накопить.
 * Поэтому события складываются в очередь и уходят пачкой раз в десять секунд,
 * а при уходе со страницы — через `sendBeacon`, который браузер доставляет
 * даже если вкладку уже закрыли.
 *
 * Идентификатор устройства случайный и живёт в localStorage. Он нужен ровно
 * для одного: отличить «десять человек по разу» от «один человек десять раз».
 * Ни почты, ни адреса, ни чего-либо, по чему человека можно узнать, здесь нет
 * и быть не должно.
 */

const DEVICE_KEY = "swiper-device";
const FLUSH_MS = 10_000;

type Event = { type: string; [key: string]: unknown };

let queue: Event[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let armed = false;

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Одна сессия — от загрузки страницы до ухода. Перезагрузка начинает новую. */
const session = uid();

function device(): string {
  try {
    const saved = localStorage.getItem(DEVICE_KEY);
    if (saved) return saved;
    const fresh = uid();
    localStorage.setItem(DEVICE_KEY, fresh);
    return fresh;
  } catch {
    // Приватный режим или заблокированное хранилище: считаем устройство новым.
    return session;
  }
}

/** Первое ли это открытие на устройстве — пригодится воронке первого запуска. */
export function isFirstLaunch(): boolean {
  try {
    return !localStorage.getItem(DEVICE_KEY);
  } catch {
    return true;
  }
}

function send(beacon: boolean): void {
  if (!queue.length) return;
  const body = JSON.stringify({ device: device(), session, events: queue });
  queue = [];
  try {
    if (beacon && typeof navigator !== "undefined" && "sendBeacon" in navigator) {
      navigator.sendBeacon("/api/stat", new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch("/api/stat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Статистика — не повод ломать приложение.
  }
}

function arm(): void {
  if (armed || typeof window === "undefined") return;
  armed = true;
  // pagehide, а не beforeunload: на телефонах beforeunload часто не приходит
  // вовсе, а вкладку убирают в фон и больше не возвращают.
  window.addEventListener("pagehide", () => send(true));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") send(true);
  });
}

/** Запомнить событие. Уйдёт пачкой — не сразу. */
export function track(type: string, payload: Record<string, unknown> = {}): void {
  if (typeof window === "undefined") return;
  arm();
  queue.push({ type, ...payload });
  if (queue.length >= 40) {
    send(false);
    return;
  }
  if (!timer) {
    timer = setTimeout(() => {
      timer = null;
      send(false);
    }, FLUSH_MS);
  }
}
