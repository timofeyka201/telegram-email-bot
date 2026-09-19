"use client";

import { useEffect, useState } from "react";
import AuthPageShell from "@/components/AuthPageShell";
import { toast } from "@/components/Toast";

type Check = { label: string; value: string; ok: boolean | null; note?: string };

/**
 * Страница самопроверки. Установку приложения ломает обычно одно из немногого:
 * не тот протокол, не зарегистрировался worker, не прочитался манифест или
 * браузер просто не умеет ставить приложения. Спрашивать об этом человека
 * бесполезно — пусть ответит сам браузер.
 */
export default function PwaCheckPage() {
  const [checks, setChecks] = useState<Check[]>([]);
  const [waiting, setWaiting] = useState(true);

  useEffect(() => {
    let promptFired = false;
    const onPrompt = () => {
      promptFired = true;
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    const run = async () => {
      const out: Check[] = [];
      const ua = navigator.userAgent;

      out.push({
        label: "Браузер",
        value: /YaBrowser\/([\d.]+)/.exec(ua)?.[0] ?? (/Chrome\/([\d.]+)/.exec(ua)?.[0] ?? "неизвестен"),
        ok: null,
        note: ua,
      });

      const secure = window.isSecureContext;
      out.push({
        label: "Адрес",
        value: `${location.protocol}//${location.host} — ${secure ? "защищённый" : "НЕ защищённый"}`,
        ok: secure,
        note: secure ? undefined : "Без https установка невозможна ни в одном браузере.",
      });

      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as { standalone?: boolean }).standalone === true;
      out.push({
        label: "Открыто как приложение",
        value: standalone ? "да, своим окном" : "нет, вкладкой браузера",
        ok: null,
      });

      // Манифест
      try {
        const res = await fetch("/manifest.webmanifest", { cache: "no-store" });
        const m = (await res.json()) as { icons?: unknown[]; display?: string; start_url?: string };
        const big = (m.icons ?? []).filter(
          (i) => typeof (i as { sizes?: string }).sizes === "string" && /(192|512)/.test((i as { sizes: string }).sizes),
        ).length;
        out.push({
          label: "Манифест",
          value: `прочитан, иконок 192/512: ${big}, display: ${m.display ?? "—"}`,
          ok: res.ok && big > 0 && m.display === "standalone",
        });
      } catch (e) {
        out.push({ label: "Манифест", value: `не прочитан: ${e instanceof Error ? e.message : "ошибка"}`, ok: false });
      }

      // Service worker
      if (!("serviceWorker" in navigator)) {
        out.push({ label: "Service worker", value: "браузер не поддерживает", ok: false });
      } else {
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          const active = regs.filter((r) => r.active).length;
          out.push({
            label: "Service worker",
            value: regs.length
              ? `зарегистрирован (активных: ${active}, управляет страницей: ${navigator.serviceWorker.controller ? "да" : "нет"})`
              : "не зарегистрирован",
            ok: active > 0,
            note: regs.length ? undefined : "Перезагрузите страницу один раз — он ставится после полной загрузки.",
          });
        } catch (e) {
          out.push({ label: "Service worker", value: e instanceof Error ? e.message : "ошибка", ok: false });
        }
      }

      // Даём браузеру время прислать событие: оно приходит не мгновенно.
      await new Promise((r) => setTimeout(r, 4000));
      out.push({
        label: "Предложение установки",
        value: promptFired ? "браузер прислал — кнопка «Установить» работает" : "браузер не прислал",
        ok: promptFired,
        note: promptFired
          ? undefined
          : "Этого события нет в Safari и не во всех версиях Яндекс.Браузера. Тогда ставят через меню браузера.",
      });

      setChecks(out);
      setWaiting(false);
    };

    void run();
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const report = checks.map((c) => `${c.label}: ${c.value}${c.note ? `\n  (${c.note})` : ""}`).join("\n");

  return (
    <AuthPageShell title="Проверка установки">
      {waiting ? (
        <p className="text-[14px] leading-relaxed text-[var(--color-ink-soft)]">
          Опрашиваем браузер… Это занимает несколько секунд: предложение установки приходит
          не сразу.
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-2.5">
            {checks.map((c) => (
              <li key={c.label} className="rounded-2xl bg-[var(--color-surface-2)] px-3.5 py-2.5">
                <div className="flex items-start gap-2">
                  <span
                    aria-hidden
                    className={`mt-[3px] h-2.5 w-2.5 shrink-0 rounded-full ${
                      c.ok === null
                        ? "bg-[var(--color-muted)]"
                        : c.ok
                          ? "bg-[var(--color-like)]"
                          : "bg-[var(--color-nope)]"
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] font-bold uppercase tracking-wider text-[var(--color-muted)]">
                      {c.label}
                    </span>
                    <span className="block break-words text-[13px] leading-snug">{c.value}</span>
                    {c.note && (
                      <span className="mt-1 block break-words text-[12px] leading-snug text-[var(--color-muted)]">
                        {c.note}
                      </span>
                    )}
                  </span>
                </div>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(report);
                toast("Отчёт скопирован", "like");
              } catch {
                toast("Не получилось скопировать — сделайте снимок экрана", "warn");
              }
            }}
            className="brand-gradient mt-4 w-full rounded-2xl py-3 text-[15px] font-bold text-white"
          >
            Скопировать отчёт
          </button>
        </>
      )}
    </AuthPageShell>
  );
}
