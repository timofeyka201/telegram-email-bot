"use client";

import { useState } from "react";
import { IconCheck, IconHeart } from "./Icons";
import { toast } from "./Toast";
import { useHydrated, useStore } from "@/lib/store";
import type { Product } from "@/lib/types";

/**
 * «Сохранить» на странице товара, пришедшего по ссылке.
 *
 * Регистрации не просим: списки живут в браузере и уезжают в аккаунт потом,
 * если человек войдёт. Смысл кнопки — чтобы пришедший по чужой ссылке унёс с
 * собой хоть что-то и получил повод вернуться.
 */
export default function SaveToLikes({ product }: { product: Product }) {
  const hydrated = useHydrated();
  const liked = useStore((s) => s.liked);
  const like = useStore((s) => s.like);
  const unlike = useStore((s) => s.unlike);
  const [touched, setTouched] = useState(false);

  const saved = hydrated && liked.some((p) => p.id === product.id);

  return (
    <button
      type="button"
      onClick={() => {
        setTouched(true);
        if (saved) {
          unlike(product.id);
          toast("Убрали из избранного");
        } else {
          like(product);
          toast("Сохранили — ищите в «Избранном»", "like");
        }
      }}
      className={`flex min-h-[52px] items-center justify-center gap-2 rounded-2xl text-[15px] font-bold transition-colors ${
        saved
          ? "on-accent bg-[var(--color-like)]"
          : "bg-[var(--color-surface)] text-[var(--color-ink)] soft-shadow"
      }`}
    >
      {saved ? <IconCheck className="h-5 w-5" /> : <IconHeart className="h-5 w-5 text-[var(--color-like)]" />}
      {saved ? (touched ? "Сохранено в избранном" : "Уже в избранном") : "Сохранить себе"}
    </button>
  );
}
