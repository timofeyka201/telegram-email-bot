"use client";

import { useState } from "react";
import { IconShare } from "./Icons";
import { toast } from "./Toast";
import { useInstall } from "@/lib/pwa";

/** Пронумерованные шаги — одинаковые на вид для всех браузеров. */
function Steps({ children }: { children: React.ReactNode }) {
  return (
    <ol className="mt-3 flex list-decimal flex-col gap-1.5 pl-5 text-[13px] leading-snug text-[var(--color-ink-soft)]">
      {children}
    </ol>
  );
}

/** Три точки или три полоски — в разных версиях меню выглядит по-разному. */
function MenuDots() {
  return <span className="font-bold">⋮</span>;
}

/**
 * Предложение поставить приложение на домашний экран. В настройках, а не
 * плашкой поверх ленты: навязчивый баннер про установку — первое, что
 * закрывают, не читая.
 */
export default function InstallBlock() {
  const { installed, way, browser, install } = useInstall();
  const [howTo, setHowTo] = useState(false);

  if (installed || way === "none") return null;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      toast("Ссылка скопирована", "like");
    } catch {
      toast("Скопируйте адрес из адресной строки", "warn");
    }
  };

  return (
    <>
      <p className="mb-2 mt-5 text-[12px] font-bold uppercase tracking-wider text-[var(--color-muted)]">
        На домашний экран
      </p>
      <div className="soft-shadow rounded-2xl bg-[var(--color-surface)] px-4 py-3.5">
        <p className="text-[13px] leading-snug text-[var(--color-ink-soft)]">
          {way === "ios-needs-safari"
            ? "Приложение можно поставить на домашний экран — оно откроется на весь экран, без адресной строки. Но на iPhone ярлык умеет создавать только Safari."
            : "Приложение можно поставить на домашний экран — оно откроется на весь экран, без адресной строки, и будет работать даже без связи."}
        </p>

        {way === "prompt" && (
          <button
            type="button"
            onClick={async () => {
              const outcome = await install();
              if (outcome === "accepted") toast("Приложение установлено", "like");
            }}
            className="brand-gradient mt-3 w-full rounded-xl py-2.5 text-[14px] font-bold text-white"
          >
            Установить
          </button>
        )}

        {way === "ios-needs-safari" && (
          <>
            <Steps>
              <li>Скопируйте ссылку на приложение — кнопкой ниже.</li>
              <li>Откройте Safari и вставьте её в адресную строку.</li>
              <li>
                В Safari нажмите <IconShare className="mx-0.5 inline h-4 w-4 align-text-bottom" />{" "}
                «Поделиться» → «На экран „Домой“» → «Добавить».
              </li>
            </Steps>
            <button
              type="button"
              onClick={copyLink}
              className="brand-gradient mt-3 w-full rounded-xl py-2.5 text-[14px] font-bold text-white"
            >
              Скопировать ссылку
            </button>
            <p className="mt-2.5 text-[12px] leading-snug text-[var(--color-muted)]">
              Это ограничение самого iPhone: другие браузеры там добавляют закладку, которая
              открывается обратно в браузере.
            </p>
          </>
        )}

        {way === "safari-ios" && (
          <>
            {howTo && (
              <Steps>
                <li>
                  Нажмите <IconShare className="mx-0.5 inline h-4 w-4 align-text-bottom" /> «Поделиться»
                  внизу экрана Safari.
                </li>
                <li>Выберите «На экран „Домой“».</li>
                <li>Нажмите «Добавить» — ярлык появится рядом с остальными приложениями.</li>
              </Steps>
            )}
            <button
              type="button"
              onClick={() => setHowTo((v) => !v)}
              aria-expanded={howTo}
              className="mt-3 w-full rounded-xl bg-[var(--color-surface-2)] py-2.5 text-[14px] font-bold text-[var(--color-ink)]"
            >
              {howTo ? "Понятно" : "Как это сделать"}
            </button>
          </>
        )}

        {(way === "yandex-android" || way === "menu-android") && (
          <>
            {howTo && (
              <Steps>
                <li>
                  Откройте меню <MenuDots /> в {browser}.
                </li>
                <li>
                  Выберите «Установить приложение»
                  {way === "yandex-android" ? " или «Добавить на главный экран»" : ""}.
                </li>
                <li>Подтвердите — ярлык появится рядом с остальными приложениями.</li>
              </Steps>
            )}
            <button
              type="button"
              onClick={() => setHowTo((v) => !v)}
              aria-expanded={howTo}
              className="mt-3 w-full rounded-xl bg-[var(--color-surface-2)] py-2.5 text-[14px] font-bold text-[var(--color-ink)]"
            >
              {howTo ? "Понятно" : "Как это сделать"}
            </button>
          </>
        )}
      </div>
    </>
  );
}
