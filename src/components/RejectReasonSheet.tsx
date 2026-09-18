"use client";

import Sheet from "./Sheet";
import Img from "./Img";
import { REJECT_REASONS, type RejectReason } from "@/lib/taste";
import type { Product } from "@/lib/types";

/**
 * Уточнение причины отказа. Спрашиваем редко (см. ASK_REASON_EVERY): один
 * ответ уточняет профиль сильнее, чем десяток свайпов, но частый вопрос
 * превращает ленту в анкету.
 */
export default function RejectReasonSheet({
  product,
  onAnswer,
}: {
  product: Product | null;
  onAnswer: (reason: RejectReason | null) => void;
}) {
  return (
    <Sheet open={!!product} title="Что не подошло?" onClose={() => onAnswer(null)}>
      {product && (
        <>
          <div className="mb-4 flex items-center gap-3 rounded-2xl bg-[var(--color-surface)] p-2.5 soft-shadow">
            <Img src={product.images[0]} alt="" className="h-14 w-14 shrink-0 rounded-xl" fallbackLabel="" />
            <p className="line-clamp-2 text-[13px] leading-tight">{product.title}</p>
          </div>
          <p className="mb-3 text-[13px] leading-snug text-[var(--color-muted)]">
            Ответ поможет реже показывать похожее. Спросим не скоро.
          </p>
          <div className="flex flex-col gap-2">
            {REJECT_REASONS.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onAnswer(r.id)}
                className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3.5 text-left text-[15px] font-semibold transition-colors active:bg-[var(--color-brand-soft)]"
              >
                {r.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onAnswer(null)}
              className="mt-1 py-3 text-[14px] font-semibold text-[var(--color-muted)]"
            >
              Не хочу отвечать
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}
