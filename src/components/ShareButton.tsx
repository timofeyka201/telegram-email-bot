"use client";

import { IconShare } from "./Icons";
import { toast } from "./Toast";
import { cardUrlAbsolute } from "@/lib/shop";
import { track } from "@/lib/stat";
import type { Product } from "@/lib/types";

/**
 * «Поделиться товаром».
 *
 * Ведёт на нашу страницу товара, а не на AliExpress. Это и есть всё
 * отличие: по ссылке на магазин уходят и переход, и комиссия, и человек, а
 * по ссылке на витрину приходит новый.
 *
 * На телефоне открывается системное окно с мессенджерами — там, где друзья
 * и так переписываются. Где его нет (настольный браузер, старый Android),
 * ссылка просто ложится в буфер.
 */
export default function ShareButton({ product, className = "" }: { product: Product; className?: string }) {
  const share = async () => {
    const url = cardUrlAbsolute(product);
    const title = product.title.slice(0, 120);
    track("share", { kind: "product", category: product.category, group: product.group });

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, text: title, url });
        return;
      } catch (e) {
        // Человек закрыл окно — это не ошибка и говорить о ней не надо.
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      toast("Ссылка скопирована", "like");
    } catch {
      toast("Браузер не дал доступ к буферу", "warn");
    }
  };

  return (
    <button
      type="button"
      onClick={share}
      aria-label="Поделиться товаром"
      title="Поделиться товаром"
      className={`flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-[var(--color-ink)] ${className}`}
    >
      <IconShare className="h-5 w-5" />
    </button>
  );
}
