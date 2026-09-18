"use client";

import { useEffect, useState } from "react";

export function proxied(src: string): string {
  return `/api/img?u=${encodeURIComponent(src)}`;
}

type Props = {
  src?: string;
  alt: string;
  className?: string;
  /** Что показать, если картинку не удалось загрузить вовсе */
  fallbackLabel?: string;
  eager?: boolean;
};

type Stage = "direct" | "proxy" | "failed";

/**
 * Картинки маркетплейсов грузятся в браузере напрямую с их CDN: запрос идёт с
 * адреса пользователя, а не из дата-центра, поэтому не упирается в лимиты,
 * которыми маркетплейсы встречают серверные запросы. Referer не отправляем —
 * часть CDN отдаёт файл только при его отсутствии или «своём» значении.
 *
 * Если прямая загрузка всё же не удалась, пробуем через собственный прокси, и
 * только потом показываем заглушку.
 */
export default function Img({ src, alt, className = "", fallbackLabel, eager }: Props) {
  const local = !!src && src.startsWith("/");
  const [stage, setStage] = useState<Stage>("direct");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setStage("direct");
    setLoaded(false);
  }, [src]);

  if (!src || stage === "failed") {
    return (
      <div
        className={`${className} flex items-center justify-center text-[var(--color-muted)]`}
        style={{ background: "linear-gradient(140deg, #f4f5f7 0%, #e9ecf1 100%)" }}
      >
        <span className="px-4 text-center text-xs leading-snug">{fallbackLabel ?? "Нет изображения"}</span>
      </div>
    );
  }

  const url = stage === "direct" || local ? src : proxied(src);

  return (
    <span className={`${className} relative block overflow-hidden`}>
      {!loaded && <span className="skeleton absolute inset-0" />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={url}
        src={url}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        draggable={false}
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        onError={() => {
          // Локальные адреса через прокси гонять незачем — сразу заглушка.
          setStage(stage === "direct" && !local ? "proxy" : "failed");
        }}
        className={`h-full w-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
      />
    </span>
  );
}
