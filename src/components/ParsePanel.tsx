"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { IconLayers, IconSearch, IconSpark } from "./Icons";
import { toast } from "./Toast";
import { loadNextPage } from "@/lib/feed";
import { useStore } from "@/lib/store";
import type { ParseResult } from "@/lib/types";

const CHIPS = ["наушники", "часы", "сумка", "кроссовки", "телефон", "ноутбук", "очки", "платье", "мебель", "косметика"];

type ProviderInfo = { id: string; label: string; note: string; ready: boolean; needsToken: boolean };

export default function ParsePanel({ onDone, compact }: { onDone?: () => void; compact?: boolean }) {
  const startFeed = useStore((s) => s.startFeed);
  const appendPage = useStore((s) => s.appendPage);
  const savedQuery = useStore((s) => s.query);
  const savedProvider = useStore((s) => s.provider);

  const [text, setText] = useState(savedQuery);
  const [links, setLinks] = useState("");
  const [byLinks, setByLinks] = useState(false);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [source, setSource] = useState<string | null>(savedProvider);
  const [loading, setLoading] = useState<null | "feed" | "links">(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d: { providers: ProviderInfo[]; defaultProvider: string }) => {
        setProviders(d.providers ?? []);
        setSource((prev) => prev ?? d.defaultProvider);
      })
      .catch(() => undefined);
  }, []);

  const current = providers.find((p) => p.id === source);
  const canUseLinks = source === "bhapi" && current?.ready;

  async function runFeed(query: string) {
    setLoading("feed");
    setError(null);
    startFeed({ provider: source, query });
    const res = await loadNextPage();
    setLoading(null);
    if (!res.ok) {
      setError(res.error ?? "Не удалось собрать ленту");
      return;
    }
    toast("Лента готова", "like");
    onDone?.();
  }

  /** Отдельный путь для 1688: разбор конкретных ссылок, а не выдачи. */
  async function runLinks() {
    const query = links.trim();
    if (!query) return setError("Вставьте ссылки на товары 1688");
    setLoading("links");
    setError(null);
    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "urls", query }),
      });
      const data = (await res.json()) as ParseResult & { error?: string };
      if (!res.ok || !data.products?.length) {
        setError(data.error || "Не удалось разобрать ссылки");
        return;
      }
      startFeed({ provider: "bhapi", query: "" });
      appendPage(data.products, "0.0", "bhapi", "1688 по ссылкам");
      if (data.errors?.length) toast(`${data.errors.length} ссылок не разобрались`, "warn");
      toast(`Готово: ${data.products.length} карточек`, "like");
      onDone?.();
    } catch {
      setError("Не удалось связаться с сервером");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className={compact ? "" : "px-5 pb-8 pt-6"}>
      {!compact && (
        <div className="mb-5">
          <h1 className="text-[26px] font-bold leading-tight tracking-tight">Свайпайте товары</h1>
          <p className="mt-1.5 text-[15px] leading-snug text-[var(--color-muted)]">
            Вправо — нравится, влево — мимо, вверх — сразу в корзину. Лента не заканчивается.
          </p>
        </div>
      )}

      <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Источник данных</p>
      <div className="mb-4 flex flex-col gap-2">
        {providers.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setSource(p.id);
              setByLinks(false);
              setError(null);
            }}
            className={`flex items-start gap-3 rounded-2xl border px-3.5 py-3 text-left transition-colors ${
              source === p.id
                ? "border-[var(--color-accent)] bg-[var(--color-surface)]"
                : "border-[var(--color-line)] bg-[var(--color-surface)]"
            } ${p.ready ? "" : "opacity-55"}`}
          >
            <span
              className={`mt-0.5 h-[18px] w-[18px] shrink-0 rounded-full border-[6px] transition-colors ${
                source === p.id ? "border-[var(--color-accent)]" : "border-[var(--color-line)]"
              }`}
            />
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold">
                {p.label}
                {!p.ready && <span className="ml-2 text-[12px] font-normal text-[var(--color-muted)]">не настроен</span>}
              </span>
              <span className="block text-[13px] leading-snug text-[var(--color-muted)]">{p.note}</span>
            </span>
          </button>
        ))}
      </div>

      {canUseLinks && (
        <div className="mb-3 inline-flex rounded-full bg-[var(--color-surface-2)] p-1">
          {(
            [
              [false, "По слову"],
              [true, "По ссылкам"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={label}
              type="button"
              onClick={() => setByLinks(value)}
              className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors ${
                byLinks === value ? "bg-[var(--color-surface)] text-[var(--color-ink)] shadow-sm" : "text-[var(--color-muted)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="soft-shadow rounded-2xl bg-[var(--color-surface)] p-1.5">
        {byLinks ? (
          <textarea
            value={links}
            onChange={(e) => {
              setLinks(e.target.value);
              setError(null);
            }}
            rows={4}
            placeholder="Ссылки на товары 1688 или их ID, по одной в строке"
            className="w-full resize-none rounded-xl bg-transparent px-3 py-2.5 text-[15px] outline-none placeholder:text-[var(--color-muted)]"
          />
        ) : (
          <input
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void runFeed(text.trim());
              }
            }}
            placeholder="Что ищем? Пустой запрос — вся витрина"
            className="w-full rounded-xl bg-transparent px-3 py-2.5 text-[15px] outline-none placeholder:text-[var(--color-muted)]"
          />
        )}
      </div>

      {!byLinks && (
        <div className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1">
          {CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setText(c);
                void runFeed(c);
              }}
              className="whitespace-nowrap rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-3.5 py-1.5 text-[13px] font-medium transition-colors active:bg-[var(--color-surface-2)]"
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-xl bg-[#fff1f0] px-3.5 py-2.5 text-[13px] leading-snug text-[#c2352a]">{error}</p>
      )}

      <div className="mt-4 flex gap-2.5">
        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={() => (byLinks ? void runLinks() : void runFeed(text.trim()))}
          disabled={loading !== null}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--color-accent)] px-5 py-3.5 text-[15px] font-semibold text-[var(--color-accent-ink)] disabled:opacity-60"
        >
          {loading ? (
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
          onClick={() => {
            setSource("demo");
            setByLinks(false);
            startFeed({ provider: "demo", query: "" });
            void loadNextPage().then((r) => (r.ok ? onDone?.() : setError(r.error ?? "")));
          }}
          disabled={loading !== null}
          className="soft-shadow flex items-center justify-center gap-2 rounded-2xl bg-[var(--color-surface)] px-4 py-3.5 text-[15px] font-semibold disabled:opacity-60"
        >
          <IconSpark className="h-5 w-5 text-[var(--color-amber)]" />
          Офлайн
        </motion.button>
      </div>

      {!compact && (
        <div className="mt-6 grid grid-cols-3 gap-2 text-center">
          {[
            ["Свайп", "вправо — в избранное"],
            ["Свайп вверх", "сразу в корзину"],
            ["Тап по краю", "листает фото"],
          ].map(([t, s]) => (
            <div key={t} className="soft-shadow rounded-2xl bg-[var(--color-surface)] px-2 py-3">
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

function Spinner() {
  return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />;
}
