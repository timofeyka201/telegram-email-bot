"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Mark } from "./Brand";
import { IconArrowRight, IconCheck } from "./Icons";

const BUDGETS: { id: string; label: string; note: string; value?: number }[] = [
  { id: "low", label: "До 1 500 ₽", note: "мелочи и повседневное", value: 1500 },
  { id: "mid", label: "1 500 – 5 000 ₽", note: "обычная покупка", value: 5000 },
  { id: "high", label: "5 000 – 20 000 ₽", note: "вещи подороже", value: 20000 },
  { id: "any", label: "Без ограничений", note: "цена не главное" },
];

const MIN_PICKS = 3;

/**
 * Тест вкусов при первом запуске. Задача — не собрать анкету, а получить
 * достаточно сигнала, чтобы первая же лента не была случайной. Поэтому всего
 * два вопроса и явная возможность пропустить.
 */
export default function TasteQuiz({
  categories,
  onDone,
}: {
  categories: string[];
  onDone: (picked: string[], budget?: number) => void;
}) {
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [budget, setBudget] = useState<string | null>(null);

  const toggle = (c: string) =>
    setPicked((list) => (list.includes(c) ? list.filter((x) => x !== c) : [...list, c]));

  const finish = () => onDone(picked, BUDGETS.find((b) => b.id === budget)?.value);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] mx-auto flex max-w-[480px] flex-col bg-[var(--color-bg)] pb-[calc(20px+env(safe-area-inset-bottom))] pt-[max(28px,env(safe-area-inset-top))]"
    >
      <div className="flex items-center gap-3 px-5 pb-4">
        <Mark className="h-7 w-7 shrink-0" id="quiz-mark" />
        <div className="flex flex-1 gap-1.5">
          {[0, 1].map((i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i <= step ? "bg-[var(--color-brand)]" : "bg-[var(--color-line)]"
              }`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => onDone([], undefined)}
          className="shrink-0 text-[13px] font-semibold text-[var(--color-muted)]"
        >
          Пропустить
        </button>
      </div>

      {step === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col px-5">
          <h1 className="font-display text-[24px] font-bold leading-tight">Что вам интересно?</h1>
          <p className="mt-1.5 text-[14px] leading-snug text-[var(--color-muted)]">
            Выберите хотя бы {MIN_PICKS} категории — с них начнём ленту. Дальше она подстроится сама.
          </p>
          <div className="no-scrollbar -mx-5 mt-4 flex-1 overflow-y-auto px-5 pb-2">
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => {
                const on = picked.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggle(c)}
                    aria-pressed={on}
                    className={`flex items-center gap-1.5 rounded-full border px-4 py-2.5 text-[14px] font-medium transition-colors ${
                      on
                        ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)] text-[var(--color-brand)]"
                        : "border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-soft)]"
                    }`}
                  >
                    {on && <IconCheck className="h-3.5 w-3.5" />}
                    {c}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col px-5">
          <h1 className="font-display text-[24px] font-bold leading-tight">Какой бюджет обычно?</h1>
          <p className="mt-1.5 text-[14px] leading-snug text-[var(--color-muted)]">
            Дороже показывать не перестанем — просто реже.
          </p>
          <div className="mt-5 flex flex-col gap-2.5">
            {BUDGETS.map((b) => {
              const on = budget === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setBudget(b.id)}
                  aria-pressed={on}
                  className={`flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-colors ${
                    on
                      ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)]"
                      : "border-[var(--color-line)] bg-[var(--color-surface)]"
                  }`}
                >
                  <span
                    className={`h-[18px] w-[18px] shrink-0 rounded-full border-[6px] transition-colors ${
                      on ? "border-[var(--color-brand)]" : "border-[var(--color-line)]"
                    }`}
                  />
                  <span>
                    <span className="block text-[15px] font-bold leading-tight">{b.label}</span>
                    <span className="block text-[13px] text-[var(--color-muted)]">{b.note}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="px-5 pt-4">
        {step === 0 ? (
          <button
            type="button"
            onClick={() => setStep(1)}
            disabled={picked.length < MIN_PICKS}
            className="brand-gradient flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-[16px] font-bold text-white disabled:opacity-40"
          >
            {picked.length < MIN_PICKS ? `Выберите ещё ${MIN_PICKS - picked.length}` : "Дальше"}
            {picked.length >= MIN_PICKS && <IconArrowRight className="h-5 w-5" />}
          </button>
        ) : (
          <button
            type="button"
            onClick={finish}
            disabled={!budget}
            className="brand-gradient w-full rounded-2xl py-4 text-[16px] font-bold text-white disabled:opacity-40"
          >
            Показать ленту
          </button>
        )}
      </div>
    </motion.div>
  );
}
