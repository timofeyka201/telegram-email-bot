"use client";

import Link from "next/link";
import { Mark } from "@/components/Brand";

/**
 * Показывается, когда страница не открылась и в кэше её тоже нет. Лежит в
 * кэше service worker'а с самой установки, поэтому появляется и без сети.
 */
export default function OfflinePage() {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="soft-shadow w-full max-w-[400px] min-w-0 rounded-3xl bg-[var(--color-surface)] p-6 text-center">
        <Mark className="mx-auto mb-4 h-11 w-11" id="offline-mark" />
        <h1 className="mb-2 text-[20px] font-bold leading-tight tracking-tight">Нет связи</h1>
        <p className="mb-5 text-[14px] leading-relaxed text-[var(--color-ink-soft)]">
          Эту страницу не удалось загрузить. Уже просмотренные карточки, избранное и корзина
          открываются и без сети — они лежат на устройстве.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="brand-gradient w-full rounded-2xl py-3.5 text-[15px] font-bold text-white"
        >
          Попробовать снова
        </button>
        <Link
          href="/likes"
          className="mt-4 block text-center text-[13px] font-semibold text-[var(--color-muted)] hover:text-[var(--color-ink)]"
        >
          Открыть избранное
        </Link>
      </div>
    </div>
  );
}
