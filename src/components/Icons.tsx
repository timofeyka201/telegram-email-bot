type P = { className?: string };

const base = "currentColor";

export const IconHeart = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} fill={base} aria-hidden>
    <path d="M12 21s-7.5-4.6-9.6-9A5.6 5.6 0 0 1 12 6.3a5.6 5.6 0 0 1 9.6 5.7C19.5 16.4 12 21 12 21Z" />
  </svg>
);

export const IconX = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke={base} strokeWidth="2.4" strokeLinecap="round" aria-hidden>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const IconStar = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} fill={base} aria-hidden>
    <path d="m12 2.6 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.4l6.5-.9L12 2.6Z" />
  </svg>
);

export const IconUndo = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke={base} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 9h10a5 5 0 0 1 0 10h-3" />
    <path d="M8 5 4 9l4 4" />
  </svg>
);

export const IconCart = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke={base} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 4h2.2l2 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.55L20.5 8H6.2" />
    <circle cx="10" cy="20" r="1.4" fill={base} stroke="none" />
    <circle cx="17.5" cy="20" r="1.4" fill={base} stroke="none" />
  </svg>
);

export const IconFlame = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} fill={base} aria-hidden>
    <path d="M13 2c.6 3.2-1.2 4.6-2.6 6C8.7 9.6 7 11.2 7 14a5 5 0 0 0 10 0c0-2-1-3.4-1.8-4.6-.5 1-1.2 1.6-2 1.9.7-2.9-.2-6.5-.2-9.3Z" />
  </svg>
);

export const IconInfo = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke={base} strokeWidth="2" strokeLinecap="round" aria-hidden>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 7.6v.6" />
  </svg>
);

export const IconChevron = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke={base} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m9 6 6 6-6 6" />
  </svg>
);

export const IconSearch = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke={base} strokeWidth="2" strokeLinecap="round" aria-hidden>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </svg>
);

export const IconTrash = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke={base} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 7h16M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7M6.5 7l.8 12a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-12" />
  </svg>
);

export const IconLayers = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke={base} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m12 3 9 5-9 5-9-5 9-5Z" />
    <path d="m3 13 9 5 9-5" />
  </svg>
);

export const IconSpark = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} fill={base} aria-hidden>
    <path d="M12 2.5 13.7 9l6.5 1.7-6.5 1.7L12 19l-1.7-6.6L3.8 10.7 10.3 9 12 2.5Z" />
  </svg>
);

export const IconExternal = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke={base} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M14 4h6v6M20 4l-8.5 8.5" />
    <path d="M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
  </svg>
);
