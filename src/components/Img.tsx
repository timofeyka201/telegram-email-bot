"use client";

import { useEffect, useState } from "react";

export function proxied(src: string): string {
  return `/api/img?u=${encodeURIComponent(src)}`;
}

/**
 * Адрес превью для своих картинок. Ленте миниатюр под фотографией не нужен
 * файл на 640 точек: десяток таких начинает грузиться сразу и отнимает канал
 * у того снимка, который человек как раз рассматривает.
 *
 * Для чужих адресов размера у нас нет — возвращаем как есть.
 */
export function thumbOf(src?: string): string | undefined {
  if (!src) return src;
  return /^\/media\/[a-f0-9]{32}\.webp$/.test(src) ? src.replace(/\.webp$/, "-t.webp") : src;
}

type Props = {
  src?: string;
  alt: string;
  className?: string;
  /** Что показать, если картинку не удалось загрузить вовсе */
  fallbackLabel?: string;
  eager?: boolean;
};

/**
 * Загрузить картинку заранее, пока человек смотрит на предыдущую. Браузер
 * положит её в свой кэш, и к моменту показа она уже будет на месте.
 */
export function prefetchImage(src?: string): void {
  if (!src || typeof window === "undefined") return;
  const img = new Image();
  img.referrerPolicy = "no-referrer";
  img.decoding = "async";
  // Заранее — значит не в ущерб тому, что на экране сейчас.
  img.fetchPriority = "low";
  img.src = src;
}

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
        className={`${className} flex items-center justify-center bg-[var(--color-surface-2)] text-[var(--color-muted)]`}
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
        /*
         * Картинка из кэша бывает готова раньше, чем React успевает повесить
         * onLoad, — и тогда событие не приходит вовсе, а снимок остаётся
         * прозрачным. Раньше это почти не встречалось; теперь, когда соседние
         * фотографии подгружаются заранее, попадание в кэш стало обычным делом.
         */
        ref={(el) => {
          if (el?.complete && el.naturalWidth > 0) setLoaded(true);
        }}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        // Верхняя карточка важнее фоновых: без подсказки браузер раздаёт им
        // канал поровну, и видимая картинка ждёт невидимых.
        fetchPriority={eager ? "high" : "low"}
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
