"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { IconLayers, IconSearch, IconSpark } from "./Icons";
import { toast } from "./Toast";
import { useStore } from "@/lib/store";
import type { ParseResult } from "@/lib/types";

const CHIPS = [
  "кроссовки",
  "наушники",
  "худи оверсайз",
  "сумка шоппер",
  "умная лампа",
  "механическая клавиатура",
  "термокружка",
  "органайзер для кухни",
  "экшн-камера",
  "ковёр",
];

type Mode = "search" | "urls";

function guessMode(text: string): Mode {
  return /1688\.com|^\s*\d{6,}\s*$/m.test(text) ? "urls" : "search";
}

export default function ParsePanel({ onDone, compact }: { onDone?: () => void; compact?: boolean }) {
  const setDeck = useStore((s) => s.setDeck);
  const lastQuery = useStore((s) => s.lastQuery);

  const [text, setText] = useState(lastQuery);
  const [mode, setMode] = useState<Mode>(() => guessMode(lastQuery));
  const [loading, setLoading] = useState<null | "parse" | "demo">(null);
  const [error, setError] = useState<string | null>(null);
  const [tokenConfigured, setTokenConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d: { tokenConfigured: boolean }) => setTokenConfigured(d.tokenConfigured))
      .catch(() => setTokenConfigured(null));
  }, []);

  async function run(payload: { mode: Mode | "demo"; query?: string }, kind: "parse" | "demo") {
    setLoading(kind);
    setError(null);
    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as ParseResult & { error?: string };
      if (!res.ok || !data.products?.length) {
        setError(data.error || "Ничего не нашлось. Попробуйте другой запрос или вставьте ссылки.");
        return;
      }
      setDeck(data.products, payload.query ?? "");
      if (data.errors?.length) {
        toast(`${data.errors.length} ссылок не разобрались`, "warn");
      }
      toast(`Готово: ${data.products.length} карточек`, "like");
      onDone?.();
    } catch {
      setError("Не удалось связаться с сервером");
    } finally {
      setLoading(null);
    }
  }

  const submit = () => {
    const q = text.trim();
    if (!q) return setError(mode === "urls" ? "Вставьте ссылки на товары" : "Введите запрос");
    void run({ mode, query: q }, "parse");
  };

  return (
    <div className={compact ? "" : "px-5 pb-8 pt-6"}>
      {!compact && (
        <div className="mb-6">
          <h1 className="text-[26px] font-bold leading-tight tracking-tight">Свайпайте товары с 1688</h1>
          <p className="mt-1.5 text-[15px] leading-snug text-[var(--color-muted)]">
            Вправо — нравится, влево — мимо, вверх — сразу в корзину. Соберите подборку за пару минут.
          </p>
        </div>
      )}

      <div className="mb-3 inline-flex rounded-full bg-[var(--color-surface-2)] p-1">
        {(
          [
            ["search", "По слову"],
            ["urls", "По ссылкам"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors ${
              mode === value ? "bg-[var(--color-surface)] text-[var(--color-ink)] shadow-sm" : "text-[var(--color-muted)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="soft-shadow rounded-2xl bg-[var(--color-surface)] p-1.5">
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
            if (e.target.value.length > 8) setMode(guessMode(e.target.value));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey || mode === "search")) {
              e.preventDefault();
              submit();
            }
          }}
          rows={mode === "urls" ? 4 : 1}
          placeholder={
            mode === "urls"
              ? "Ссылки на товары 1688 или их ID, по одной в строке"
              : "Что ищем? Например: беспроводные наушники"
          }
          className="w-full resize-none rounded-xl bg-transparent px-3 py-2.5 text-[15px] outline-none placeholder:text-[var(--color-muted)]"
        />
      </div>

      {mode === "search" && (
        <div className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1">
          {CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setText(c);
                void run({ mode: "search", query: c }, "parse");
              }}
              className="whitespace-nowrap rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-3.5 py-1.5 text-[13px] font-medium text-[var(--color-ink)] transition-colors active:bg-[var(--color-surface-2)]"
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-xl bg-[#fff1f0] px-3.5 py-2.5 text-[13px] leading-snug text-[#c2352a]">{error}</p>
      )}

      {tokenConfigured === false && !error && (
        <p className="mt-3 rounded-xl bg-[#fff8e6] px-3.5 py-2.5 text-[13px] leading-snug text-[#8a6100]">
          Токен парсера не задан — реальные товары не подгрузятся. Добавьте <code>BHAPI_TOKEN</code> в{" "}
          <code>.env.local</code> или откройте демо-подборку.
        </p>
      )}

      <div className="mt-4 flex gap-2.5">
        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={submit}
          disabled={loading !== null}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--color-accent)] px-5 py-3.5 text-[15px] font-semibold text-[var(--color-accent-ink)] disabled:opacity-60"
        >
          {loading === "parse" ? (
            <>
              <Spinner /> Собираем ленту…
            </>
          ) : (
            <>
              <IconSearch className="h-5 w-5" /> Начать
            </>
          )}
        </motion.button>
        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={() => void run({ mode: "demo" }, "demo")}
          disabled={loading !== null}
          className="flex items-center justify-center gap-2 rounded-2xl bg-[var(--color-surface)] px-4 py-3.5 text-[15px] font-semibold text-[var(--color-ink)] soft-shadow disabled:opacity-60"
        >
          {loading === "demo" ? <Spinner dark /> : <IconSpark className="h-5 w-5 text-[var(--color-amber)]" />}
          Демо
        </motion.button>
      </div>

      {!compact && (
        <div className="mt-6 grid grid-cols-3 gap-2 text-center">
          {[
            ["Свайп", "вправо — в избранное"],
            ["Свайп вверх", "сразу в корзину"],
            ["Тап по краю", "листает фото"],
          ].map(([t, s]) => (
            <div key={t} className="rounded-2xl bg-[var(--color-surface)] px-2 py-3 soft-shadow">
              <IconLayers className="mx-auto mb-1.5 h-5 w-5 text-[var(--color-accent)]" />
              <p className="text-[12px] font-semibold leading-tight">{t}</p>
              <p className="text-[11px] leading-tight text-[var(--color-muted)]">{s}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Spinner({ dark }: { dark?: boolean }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-t-transparent ${
        dark ? "border-[var(--color-muted)]" : "border-white/70"
      }`}
    />
  );
}
