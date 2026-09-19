"use client";

import Link from "next/link";
import { Mark } from "./Brand";

/** Общая рамка для страниц, на которые ведут ссылки из писем. */
export default function AuthPageShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="soft-shadow w-full max-w-[400px] min-w-0 rounded-3xl bg-[var(--color-surface)] p-6">
        <div className="mb-5 flex items-center gap-3">
          <Mark className="h-9 w-9 shrink-0" id="auth-page-mark" />
          <span className="font-display text-[18px] font-bold leading-none tracking-tight">Swiper</span>
        </div>
        <h1 className="mb-3 text-[22px] font-bold leading-tight tracking-tight">{title}</h1>
        {children}
        <Link
          href="/"
          className="mt-5 block text-center text-[13px] font-semibold text-[var(--color-muted)] hover:text-[var(--color-ink)]"
        >
          Вернуться в приложение
        </Link>
      </div>
    </div>
  );
}
