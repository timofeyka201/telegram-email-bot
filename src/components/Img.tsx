"use client";

import { useState } from "react";

export function proxied(src: string): string {
  if (!src) return "";
  if (src.startsWith("/")) return src;
  return `/api/img?u=${encodeURIComponent(src)}`;
}

type Props = {
  src?: string;
  alt: string;
  className?: string;
  /** Показать «битую» заглушку вместо пустоты, если картинка не загрузилась */
  fallbackLabel?: string;
  eager?: boolean;
};

export default function Img({ src, alt, className = "", fallbackLabel, eager }: Props) {
  const [state, setState] = useState<"loading" | "ok" | "error">(src ? "loading" : "error");

  if (!src || state === "error") {
    return (
      <div
        className={`${className} flex items-center justify-center text-[var(--color-muted)]`}
        style={{ background: "linear-gradient(140deg, #f4f5f7 0%, #e9ecf1 100%)" }}
      >
        <span className="px-4 text-center text-xs leading-snug">{fallbackLabel ?? "Нет изображения"}</span>
      </div>
    );
  }

  return (
    <span className={`${className} relative block overflow-hidden`}>
      {state === "loading" && <span className="skeleton absolute inset-0" />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={proxied(src)}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        draggable={false}
        onLoad={() => setState("ok")}
        onError={() => setState("error")}
        className={`h-full w-full object-cover transition-opacity duration-300 ${state === "ok" ? "opacity-100" : "opacity-0"}`}
      />
    </span>
  );
}
