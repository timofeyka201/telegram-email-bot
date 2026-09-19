"use client";

import { useEffect, useState } from "react";

/** Событие Chrome, которым браузер предлагает показать установку своими силами. */
type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** Приложение уже открыто своим окном, а не вкладкой браузера. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari на iOS не поддерживает display-mode и держит свой флаг.
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPad с iPadOS 13+ представляется Mac'ом, отличить можно по тачскрину.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export type InstallState = {
  /** Уже установлено — предлагать нечего. */
  installed: boolean;
  /** Можно показать системный диалог. */
  canPrompt: boolean;
  /** Системного диалога нет: на iOS установку делают вручную. */
  needsManual: boolean;
  install: () => Promise<"accepted" | "dismissed" | "unavailable">;
};

export function useInstall(): InstallState {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    setIos(isIos());

    const onPrompt = (e: Event) => {
      // Браузер по умолчанию показал бы свою плашку; мы предлагаем установку
      // в настройках, в подходящий момент, поэтому перехватываем событие.
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  return {
    installed,
    canPrompt: !!prompt && !installed,
    needsManual: ios && !installed && !prompt,
    install: async () => {
      if (!prompt) return "unavailable";
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      // Событие одноразовое: второй раз тот же объект уже не сработает.
      setPrompt(null);
      return outcome;
    },
  };
}
