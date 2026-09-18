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

function Btn({
  label,
  hint,
  onClick,
  disabled,
  size = "lg",
  tone,
  children,
}: {
  label: string;
  hint?: string;
  onClick: () => void;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  tone: string;
  children: React.ReactNode;
}) {
  const dims = size === "lg" ? "h-[68px] w-[68px]" : size === "md" ? "h-13 w-13" : "h-12 w-12";
  return (
    <motion.button
      type="button"
      aria-label={label}
      title={hint ? `${label} · ${hint}` : label}
      onClick={onClick}
      disabled={disabled}
      whileTap={{ scale: 0.86 }}
      transition={{ type: "spring", stiffness: 520, damping: 24 }}
      style={{ color: tone }}
      className={`soft-shadow flex ${dims} items-center justify-center rounded-full bg-[var(--color-surface)] transition-opacity disabled:opacity-35`}
    >
      {children}
    </motion.button>
  );
}

export default function ActionBar({ onDecide, onUndo, canUndo, disabled }: Props) {
  return (
    <div className="flex items-center justify-center gap-3.5 px-4 pb-1 pt-3">
      <Btn label="Вернуть карточку" hint="Backspace" size="sm" tone="var(--color-super)" onClick={onUndo} disabled={!canUndo}>
        <IconUndo className="h-5 w-5" />
      </Btn>
      <Btn label="Не нравится" hint="стрелка влево" tone="var(--color-nope)" onClick={() => onDecide("dislike")} disabled={disabled}>
        <IconX className="h-8 w-8" />
      </Btn>
      <Btn label="Сразу в корзину" hint="стрелка вверх" size="md" tone="var(--color-brand)" onClick={() => onDecide("super")} disabled={disabled}>
        <IconCart className="h-6 w-6" />
      </Btn>
      <Btn label="Нравится" hint="стрелка вправо" tone="var(--color-like)" onClick={() => onDecide("like")} disabled={disabled}>
        <IconHeart className="h-8 w-8" />
      </Btn>
    </div>
  );
}
