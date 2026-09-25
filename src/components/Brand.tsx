/**
 * Знак Swiper. Это та же картинка, что стоит на домашнем экране и во вкладке
 * браузера: рисовать её второй раз вектором значит завести копию, которая
 * разойдётся с оригиналом при первой же правке макета.
 *
 * Скругление задаём сами: в файле иконки заливка идёт до краёв, потому что
 * форму вырезает операционная система, а внутри приложения вырезать некому.
 */
export function Mark({ className = "" }: { className?: string; id?: string }) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src="/icons/icon-192.png" alt="" aria-hidden className={`${className} rounded-[22%] object-cover`} />
  );
}

/** Логотип целиком: знак плюс название. */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <Mark className="h-7 w-7 shrink-0" />
      {!compact && (
        <span className="font-display text-[19px] leading-none text-[var(--color-ink)]">Swiper</span>
      )}
    </span>
  );
}
