"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { create } from "zustand";

type Toast = { id: number; text: string; tone?: "default" | "like" | "warn" };

type ToastState = {
  toasts: Toast[];
  push: (text: string, tone?: Toast["tone"]) => void;
  drop: (id: number) => void;
};

export const useToast = create<ToastState>((set) => ({
  toasts: [],
  push: (text, tone = "default") =>
    set((s) => ({ toasts: [...s.toasts.filter((t) => t.text !== text), { id: Date.now() + Math.random(), text, tone }] })),
  drop: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function toast(text: string, tone?: Toast["tone"]) {
  useToast.getState().push(text, tone);
}

function Item({ t }: { t: Toast }) {
  const drop = useToast((s) => s.drop);
  useEffect(() => {
    const timer = setTimeout(() => drop(t.id), 2600);
    return () => clearTimeout(timer);
  }, [t.id, drop]);

  const tone =
    t.tone === "like"
      ? "bg-[var(--color-like)] text-white"
      : t.tone === "warn"
        ? "bg-[var(--color-ink)] text-white"
        : "bg-[var(--color-ink)] text-white";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 420, damping: 32 }}
      className={`${tone} pointer-events-auto max-w-[88vw] rounded-2xl px-4 py-2.5 text-sm font-medium shadow-lg`}
    >
      {t.text}
    </motion.div>
  );
}

export default function ToastHost() {
  const toasts = useToast((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[152px] z-[60] flex flex-col items-center gap-2 px-4">
      <AnimatePresence initial={false}>
        {toasts.slice(-3).map((t) => (
          <Item key={t.id} t={t} />
        ))}
      </AnimatePresence>
    </div>
  );
}
