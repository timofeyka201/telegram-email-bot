/**
 * Знак Swiper — след свайпа: росчерк «S», оставленный пальцем, с точкой на
 * конце жеста. Читается с 20 пикселей, поэтому годится и для иконки, и для
 * шапки. Градиент берётся из фирменных токенов, так что знак живёт в обеих темах.
 */
export function Mark({ className = "", id = "swiper-mark" }: { className?: string; id?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id={id} x1="4" y1="28" x2="28" y2="4" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--color-brand)" />
          <stop offset="100%" stopColor="var(--color-brand-2)" />
        </linearGradient>
      </defs>
      <path
        d="M22.5 9.2C22.5 6.1 9.5 5.6 9.5 11.4c0 5.4 13 3.6 13 9.4 0 5.4-11.5 5.6-13 1.4"
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth="4.2"
        strokeLinecap="round"
      />
      <circle cx="9.5" cy="22.2" r="3.1" fill="var(--color-brand-2)" />
    </svg>
  );
}

/** Логотип целиком: знак плюс название. */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <Mark className="h-7 w-7 shrink-0" />
      {!compact && (
        <span className="font-display text-[19px] font-bold leading-none tracking-tight text-[var(--color-ink)]">
          Swiper
        </span>
      )}
    </span>
  );
}
