"use client";

import { motion } from "framer-motion";
import { Mark } from "./Brand";
import { IconArrowLeft, IconArrowRight, IconArrowUp, IconLayers } from "./Icons";

const STEPS = [
  { Icon: IconArrowRight, tone: "var(--color-like)", soft: "var(--color-like-soft)", title: "Свайп вправо", text: "Нравится — уходит в избранное" },
  { Icon: IconArrowLeft, tone: "var(--color-nope)", soft: "var(--color-nope-soft)", title: "Свайп влево", text: "Мимо — больше не покажем" },
  { Icon: IconArrowUp, tone: "var(--color-super)", soft: "var(--color-super-soft)", title: "Свайп вверх", text: "Сразу в корзину, без лишних шагов" },
  { Icon: IconLayers, tone: "var(--color-brand)", soft: "var(--color-brand-soft)", title: "Тап по карточке", text: "По краям листает фото, по центру открывает" },
];

/** Первый запуск: жесты нужно показать один раз, иначе половина останется ненайденной. */
export default function Onboarding({ onDone }: { onDone: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] mx-auto flex max-w-[480px] flex-col bg-[var(--color-bg)] px-6 pb-[calc(24px+env(safe-area-inset-bottom))] pt-[max(48px,env(safe-area-inset-top))]"
    >
      <div className="flex flex-1 flex-col justify-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 20 }}
          className="mb-7 flex flex-col items-center text-center"
        >
          {/* Знак сам по себе плашка — подложка под ним была бы кораллом на коралле. */}
          <Mark className="pop-shadow mb-4 h-16 w-16" />
          <h1 className="font-display text-[30px] font-bold leading-none">Swiper</h1>
          <p className="mt-2 max-w-[26ch] text-[15px] leading-snug text-[var(--color-muted)]">
            Витрина, которую листают пальцем. Четыре жеста — и больше ничего учить не нужно.
          </p>
        </motion.div>

        <ul className="flex flex-col gap-2.5">
          {STEPS.map(({ Icon, tone, soft, title, text }, i) => (
            <motion.li
              key={title}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 * i + 0.1, type: "spring", stiffness: 300, damping: 26 }}
              className="soft-shadow flex items-center gap-3.5 rounded-2xl bg-[var(--color-surface)] px-4 py-3"
            >
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={{ background: soft, color: tone }}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-bold leading-tight">{title}</span>
                <span className="block text-[13px] leading-snug text-[var(--color-muted)]">{text}</span>
              </span>
            </motion.li>
          ))}
        </ul>
      </div>

      <motion.button
        type="button"
        onClick={onDone}
        whileTap={{ scale: 0.97 }}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
        className="brand-gradient pop-shadow w-full rounded-full py-4 text-[16px] font-bold"
      >
        Поехали
      </motion.button>
      <p className="mt-3 text-center text-[12px] text-[var(--color-muted)]">
        На компьютере работают стрелки ← → ↑
      </p>
    </motion.div>
  );
}
