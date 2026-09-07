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
  onClick,
  disabled,
  size = "lg",
  className = "",
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  children: React.ReactNode;
}) {
  const dims = size === "lg" ? "h-16 w-16" : size === "md" ? "h-12 w-12" : "h-11 w-11";
  return (
    <motion.button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      whileTap={{ scale: 0.88 }}
      transition={{ type: "spring", stiffness: 500, damping: 26 }}
      className={`soft-shadow flex ${dims} items-center justify-center rounded-full bg-[var(--color-surface)] transition-opacity disabled:opacity-35 ${className}`}
    >
      {children}
    </motion.button>
  );
}

export default function ActionBar({ onDecide, onUndo, canUndo, disabled }: Props) {
  return (
    <div className="flex items-center justify-center gap-3 px-4 py-3">
      <Btn label="Вернуть карточку" size="sm" onClick={onUndo} disabled={!canUndo}>
        <IconUndo className="h-5 w-5 text-[var(--color-amber)]" />
      </Btn>
      <Btn label="Не нравится" onClick={() => onDecide("dislike")} disabled={disabled}>
        <IconX className="h-8 w-8 text-[var(--color-nope)]" />
      </Btn>
      <Btn label="Сразу в корзину" size="md" onClick={() => onDecide("super")} disabled={disabled}>
        <IconCart className="h-6 w-6 text-[var(--color-super)]" />
      </Btn>
      <Btn label="Нравится" onClick={() => onDecide("like")} disabled={disabled}>
        <IconHeart className="h-8 w-8 text-[var(--color-like)]" />
      </Btn>
    </div>
  );
}
