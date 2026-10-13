"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Mark } from "./Brand";
import { IconArrowRight, IconCheck } from "./Icons";
import {
  AUDIENCE_OPTIONS,
  MATERIAL_OPTIONS,
  STYLE_OPTIONS,
  seedTags,
  type FacetOption,
} from "@/lib/facets";

const BUDGETS: { id: string; label: string; note: string; value?: number }[] = [
  { id: "low", label: "До 1 500 ₽", note: "мелочи и повседневное", value: 1500 },
  { id: "mid", label: "1 500 – 5 000 ₽", note: "обычная покупка", value: 5000 },
  { id: "high", label: "5 000 – 20 000 ₽", note: "вещи подороже", value: 20000 },
  { id: "any", label: "Без ограничений", note: "цена не главное" },
];

const MIN_PICKS = 3;

/**
 * Тест вкусов при первом запуске. Задача — не собрать анкету, а получить
 * достаточно сигнала, чтобы первая же лента не была случайной.
 *
 * Вопросов четыре, и порядок у них не случайный: сперва то, что дороже всего
 * ошибиться. Пол — половина каталога одежда, и мужчине листать платья
 * бессмысленно; дальше категории; стиль с материалом — уточнение, его можно
 * проскочить, ничего не выбрав; бюджет — последним, он правит оценку, а не
 * отбор. На любом шаге есть «Пропустить»: анкета, которую нельзя закрыть, —
 * это не тест вкусов, а турникет.
 *
 * Ответы про пол, стиль и материал ложатся в скрытые метки профиля теми же
 * весами, какими их набирают свайпы, — просто сразу.
 */
export default function TasteQuiz({
  categories,
  tags,
  onDone,
}: {
  categories: string[];
  /** какие метки вообще есть в каталоге: про остальные не спрашиваем */
  tags: string[];
  onDone: (picked: string[], budget?: number, seeded?: Record<string, number>) => void;
}) {
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [audience, setAudience] = useState<string[]>([]);
  const [styles, setStyles] = useState<string[]>([]);
  const [materials, setMaterials] = useState<string[]>([]);
  const [budget, setBudget] = useState<string | null>(null);

  const known = new Set(tags);
  /* Пока каталог не размечен метками, спрашивать не о чем — показываем то,
     что есть, а шаги про стиль и материал просто не появляются. */
  const has = (options: FacetOption[]) => options.filter((o) => known.has(o.tag));
  const audienceOptions = has(AUDIENCE_OPTIONS);
  const styleOptions = has(STYLE_OPTIONS);
  const materialOptions = has(MATERIAL_OPTIONS);

  const steps = [
    ...(audienceOptions.length ? (["audience"] as const) : []),
    "categories" as const,
    ...(styleOptions.length || materialOptions.length ? (["look"] as const) : []),
    "budget" as const,
  ];
  const current = steps[step];
  const last = step === steps.length - 1;

  const flip = (list: string[], value: string) =>
    list.includes(value) ? list.filter((x) => x !== value) : [...list, value];

  const finish = () =>
    onDone(picked, BUDGETS.find((b) => b.id === budget)?.value, seedTags({ audience, styles, materials }));

  /** Следующий шаг доступен: на уточняющих вопросах — всегда. */
  const ready =
    current === "categories" ? picked.length >= MIN_PICKS : current === "budget" ? !!budget : true;

  const chip = (on: boolean) =>
    `flex items-center gap-1.5 rounded-full border px-4 py-2.5 text-[14px] font-medium transition-colors ${
      on
        ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)] text-[var(--color-brand)]"
        : "border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-soft)]"
    }`;

  const Chips = ({
    options,
    value,
    onPick,
  }: {
    options: FacetOption[];
    value: string[];
    onPick: (tag: string) => void;
  }) => (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o.tag);
        return (
          <button key={o.tag} type="button" onClick={() => onPick(o.tag)} aria-pressed={on} className={chip(on)}>
            {on && <IconCheck className="h-3.5 w-3.5" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );

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
          {steps.map((name, i) => (
            <span
              key={name}
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

      {current === "audience" && (
        <div className="flex min-h-0 flex-1 flex-col px-5">
          <h1 className="font-display text-[24px] font-bold leading-tight">Кому выбираете?</h1>
          <p className="mt-1.5 text-[14px] leading-snug text-[var(--color-muted)]">
            Можно несколько. Это про одежду и обувь — остального не касается.
          </p>
          {/* Строками, а не чипами: вариантов три, экран всё равно пустой, а
              попасть пальцем по строке проще, чем по мелкой таблетке. */}
          <div className="mt-5 flex flex-col gap-2.5">
            {audienceOptions.map((o) => {
              const on = audience.includes(o.tag);
              return (
                <button
                  key={o.tag}
                  type="button"
                  onClick={() => setAudience((l) => flip(l, o.tag))}
                  aria-pressed={on}
                  className={`flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-colors ${
                    on
                      ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)]"
                      : "border-[var(--color-line)] bg-[var(--color-surface)]"
                  }`}
                >
                  <span
                    className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-lg border-2 transition-colors ${
                      on
                        ? "border-[var(--color-brand)] bg-[var(--color-brand)] text-white"
                        : "border-[var(--color-line)]"
                    }`}
                  >
                    {on && <IconCheck className="h-3.5 w-3.5" />}
                  </span>
                  <span>
                    <span className="block text-[15px] font-bold leading-tight">{o.label}</span>
                    {o.note && <span className="block text-[13px] text-[var(--color-muted)]">{o.note}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {current === "categories" && (
        <div className="flex min-h-0 flex-1 flex-col px-5">
          <h1 className="font-display text-[24px] font-bold leading-tight">Что вам интересно?</h1>
          <p className="mt-1.5 text-[14px] leading-snug text-[var(--color-muted)]">
            Выберите хотя бы {MIN_PICKS} категории — с них начнём ленту. Дальше она подстроится сама.
          </p>
          <div className="no-scrollbar -mx-5 mt-4 flex-1 overflow-y-auto px-5 pb-2">
            <Chips
              options={categories.map((c) => ({ tag: c, label: c }))}
              value={picked}
              onPick={(c) => setPicked((l) => flip(l, c))}
            />
          </div>
        </div>
      )}

      {current === "look" && (
        <div className="flex min-h-0 flex-1 flex-col px-5">
          <h1 className="font-display text-[24px] font-bold leading-tight">Что вам ближе?</h1>
          <p className="mt-1.5 text-[14px] leading-snug text-[var(--color-muted)]">
            Необязательно — но так лента угадает с первых карточек, а не с пятидесятой.
          </p>
          <div className="no-scrollbar -mx-5 mt-4 flex-1 overflow-y-auto px-5 pb-2">
            {styleOptions.length > 0 && (
              <>
                <p className="mb-2 text-[12px] font-bold uppercase tracking-wider text-[var(--color-muted)]">Стиль</p>
                <Chips options={styleOptions} value={styles} onPick={(t) => setStyles((l) => flip(l, t))} />
              </>
            )}
            {materialOptions.length > 0 && (
              <>
                <p className="mb-2 mt-5 text-[12px] font-bold uppercase tracking-wider text-[var(--color-muted)]">
                  Материалы
                </p>
                <Chips options={materialOptions} value={materials} onPick={(t) => setMaterials((l) => flip(l, t))} />
              </>
            )}
          </div>
        </div>
      )}

      {current === "budget" && (
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
        <button
          type="button"
          onClick={() => (last ? finish() : setStep((i) => i + 1))}
          disabled={!ready}
          className="brand-gradient flex w-full items-center justify-center gap-2 rounded-full py-4 text-[16px] font-bold disabled:opacity-40"
        >
          {last
            ? "Показать ленту"
            : current === "categories" && picked.length < MIN_PICKS
              ? `Выберите ещё ${MIN_PICKS - picked.length}`
              : "Дальше"}
          {!last && ready && <IconArrowRight className="h-5 w-5" />}
        </button>
      </div>
    </motion.div>
  );
}
