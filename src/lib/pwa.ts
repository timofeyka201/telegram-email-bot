"use client";

import { useEffect, useState } from "react";

/** Событие Chromium, которым браузер предлагает показать установку своими силами. */
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

export function isYandex(): boolean {
  return typeof navigator !== "undefined" && /YaBrowser/i.test(navigator.userAgent);
}

/**
 * На iOS все браузеры обязаны работать на движке Safari, но ярлык на домашний
 * экран умеет ставить только сам Safari. Яндекс.Браузер, Chrome и прочие
 * добавляют закладку, которая открывается обратно в браузере, — это не то.
 */
function isIosNonSafari(): boolean {
  if (!isIos()) return false;
  return /YaBrowser|CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(navigator.userAgent);
}

/** Как в этом браузере ставят приложение на домашний экран. */
export type InstallWay =
  /** Есть системный диалог — жмём кнопку. */
  | "prompt"
  /** Safari на iPhone: «Поделиться» → «На экран „Домой“». */
  | "safari-ios"
  /** Яндекс.Браузер на Android: пункт в меню браузера. */
  | "yandex-android"
  /** Chromium на Android без события: тоже через меню. */
  | "menu-android"
  /** Яндекс.Браузер (и другие) на iPhone: поставить нельзя, нужен Safari. */
  | "ios-needs-safari"
  /** Предлагать нечего: уже установлено или браузер этого не умеет. */
  | "none";

export type InstallState = {
  installed: boolean;
  way: InstallWay;
  /** Название браузера для текста подсказки. */
  browser: string;
  install: () => Promise<"accepted" | "dismissed" | "unavailable">;
};

export function useInstall(): InstallState {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [env, setEnv] = useState({ ios: false, iosOther: false, yandex: false, android: false });

  useEffect(() => {
    setInstalled(isStandalone());
    setEnv({
      ios: isIos(),
      iosOther: isIosNonSafari(),
      yandex: isYandex(),
      android: /android/i.test(navigator.userAgent),
    });

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

  const way: InstallWay = installed
    ? "none"
    : prompt
      ? "prompt"
      : env.iosOther
        ? "ios-needs-safari"
        : env.ios
          ? "safari-ios"
          : env.android
            ? // Яндекс.Браузер на Android — Chromium и ставить умеет, но событие
              // присылает не всегда: подсказываем путь через меню.
              (env.yandex ? "yandex-android" : "menu-android")
            : "none";

  return {
    installed,
    way,
    browser: env.yandex ? "Яндекс.Браузере" : "браузере",
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
