"use client";

import { motion } from "framer-motion";
import { IconCart, IconHeart, IconUndo, IconX } from "./Icons";
import type { Decision } from "@/lib/store";

type Props = {
  onDecide: (d: Decision) => void;
  onUndo: () => void;
  canUndo: boolean;
  disabled?: boolean;
};

/**
 * Четыре решения разного веса, и размер кнопки об этом говорит: «в корзину» —
 * самая крупная и единственная с тенью, «отмена» — самая тихая. Заливки яркие,
 * поэтому иконки на них тёмные (см. --color-on-accent).
 */
function Btn({
  label,
  hint,
  onClick,
  disabled,
  className,
  children,
}: {
  label: string;
  hint?: string;
  onClick: () => void;
  disabled?: boolean;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      title={hint ? `${label} · ${hint}` : label}
      onClick={onClick}
      disabled={disabled}
      whileTap={{ scale: 0.86 }}
      transition={{ type: "spring", stiffness: 520, damping: 24 }}
      className={`flex shrink-0 items-center justify-center rounded-full transition-opacity disabled:opacity-35 ${className}`}
    >
      {children}
    </motion.button>
  );
}

export default function ActionBar({ onDecide, onUndo, canUndo, disabled }: Props) {
  return (
    <div className="flex items-center justify-center gap-4 px-4 pb-1 pt-3">
      <Btn
        label="Вернуть карточку"
        hint="Backspace"
        onClick={onUndo}
        disabled={!canUndo}
        className="h-12 w-12 bg-[var(--color-surface)] text-[var(--color-muted)]"
      >
        <IconUndo className="h-5 w-5" />
      </Btn>
      <Btn
        label="Не нравится"
        hint="стрелка влево"
        onClick={() => onDecide("dislike")}
        disabled={disabled}
        className="h-[62px] w-[62px] bg-[var(--color-surface)] text-[var(--color-nope)]"
      >
        <IconX className="h-7 w-7" />
      </Btn>
      <Btn
        label="Сразу в корзину"
        hint="стрелка вверх"
        onClick={() => onDecide("super")}
        disabled={disabled}
        className="pop-shadow on-accent h-[74px] w-[74px] bg-[var(--color-super)]"
      >
        <IconCart className="h-8 w-8" />
      </Btn>
      <Btn
        label="Нравится"
        hint="стрелка вправо"
        onClick={() => onDecide("like")}
        disabled={disabled}
        className="on-accent h-[62px] w-[62px] scale-[1.08] bg-[var(--color-like)]"
      >
        <IconHeart className="h-7 w-7" />
      </Btn>
    </div>
  );
}
