"use client";

import { useEffect } from "react";

/**
 * Регистрирует service worker. Он нужен и ради работы без сети, и ради самой
 * установки: без него браузер не предлагает поставить приложение на экран.
 */
export default function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        // Новая версия приходит в состоянии waiting и ждёт закрытия всех вкладок.
        // Просим её вступить в силу сразу: содержимое кэша от этого не портится.
        if (reg.waiting) reg.waiting.postMessage("skip-waiting");
        reg.addEventListener("updatefound", () => {
          reg.installing?.addEventListener("statechange", function () {
            if (this.state === "installed" && navigator.serviceWorker.controller) {
              this.postMessage("skip-waiting");
            }
          });
        });
        await warmCache();
      } catch {
        // Отсутствие worker'а не ломает приложение — просто не будет офлайна.
      }
    };

    /**
     * Отдаём worker'у адреса сборок, которые эта страница уже загрузила. При
     * первой загрузке он ими не управлял и в кэш их не положил, а без них
     * приложение без сети открылось бы пустой разметкой.
     */
    const warmCache = async () => {
      const worker = (await navigator.serviceWorker.ready).active;
      if (!worker) return;
      const urls = performance
        .getEntriesByType("resource")
        .map((e) => e.name)
        .filter((name) => name.startsWith(location.origin) && name.includes("/_next/static/"));
      if (urls.length) worker.postMessage({ type: "warm", urls });
    };

    // Регистрируем после загрузки: worker не должен соперничать за канал с
    // первой отрисовкой.
    if (document.readyState === "complete") void register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
