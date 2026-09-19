"use client";

import { useState } from "react";
import { IconShare } from "./Icons";
import { toast } from "./Toast";
import { useInstall } from "@/lib/pwa";

/**
 * Предложение поставить приложение на домашний экран. В настройках, а не
 * плашкой поверх ленты: навязчивый баннер про установку — первое, что
 * закрывают, не читая.
 */
export default function InstallBlock() {
  const { installed, canPrompt, needsManual, install } = useInstall();
  const [howTo, setHowTo] = useState(false);

  if (installed || (!canPrompt && !needsManual)) return null;

  return (
    <>
      <p className="mb-2 mt-5 text-[12px] font-bold uppercase tracking-wider text-[var(--color-muted)]">
        На домашний экран
      </p>
      <div className="soft-shadow rounded-2xl bg-[var(--color-surface)] px-4 py-3.5">
        <p className="text-[13px] leading-snug text-[var(--color-ink-soft)]">
          Приложение можно поставить на домашний экран — оно откроется на весь экран, без адресной
          строки, и будет работать даже без связи.
        </p>

        {canPrompt ? (
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
        ) : (
          <>
            {howTo && (
              <ol className="mt-3 flex list-decimal flex-col gap-1.5 pl-5 text-[13px] leading-snug text-[var(--color-ink-soft)]">
                <li>
                  Нажмите <IconShare className="mx-0.5 inline h-4 w-4 align-text-bottom" /> «Поделиться»
                  внизу экрана Safari.
                </li>
                <li>Выберите «На экран “Домой”».</li>
                <li>Нажмите «Добавить» — ярлык появится рядом с остальными приложениями.</li>
              </ol>
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
