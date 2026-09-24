import type { Product } from "@/lib/types";

/**
 * Вишлист — список желаний, который показывают другим. Отсюда два правила,
 * определяющие всю остальную конструкцию:
 *
 *  • список живёт на сервере, а не в браузере владельца: иначе по ссылке
 *    открывать нечего;
 *  • брони не видны владельцу. Иначе сюрприза не выйдет, а именно ради него
 *    лист желаний и заводят.
 */

export type WishSource = "swiper" | "custom";

export type WishReservation = { userId: string; name: string; at: string };

export type WishItem = {
  id: string;
  source: WishSource;
  title: string;
  price?: number;
  currency: string;
  url?: string;
  image?: string;
  /** Пожелание владельца к этому подарку: размер, цвет, «лучше без надписи». */
  note?: string;
  addedAt: string;
  /**
   * Карточка из ленты сохраняется целиком: по ней открывается тот же экран
   * товара, что и в ленте, даже если в каталоге её уже нет.
   */
  product?: Product;
  /** Кто забронировал. В ответ владельцу это поле не попадает никогда. */
  reserved?: WishReservation;
};

export type Wishlist = {
  code: string;
  ownerId: string;
  ownerName: string;
  title: string;
  note?: string;
  /** Список открыт по коду. Выключено — чужие видят «список закрыт». */
  shared: boolean;
  items: WishItem[];
  createdAt: string;
  updatedAt: number;
};

/** Что видит владелец: всё, кроме броней. */
export type OwnerItem = Omit<WishItem, "reserved">;
export type OwnerView = {
  code: string;
  title: string;
  note?: string;
  shared: boolean;
  ownerName: string;
  items: OwnerItem[];
  updatedAt: number;
};

/** Что видит гость: брони видны, но не видно, что список чужой человек правит. */
export type FriendItem = OwnerItem & {
  reserved: boolean;
  /** Бронь моя — значит, её можно снять. */
  mine: boolean;
  /** Имя того, кто забронировал; себя показываем как «вы». */
  reservedBy?: string;
};
export type FriendView = {
  code: string;
  title: string;
  note?: string;
  ownerName: string;
  items: FriendItem[];
  /** Гость не вошёл — бронировать нечем, кнопки заменяются приглашением войти. */
  canReserve: boolean;
};

/** Что человек забронировал в чужих списках — его собственная памятка. */
export type ReservedEntry = {
  code: string;
  itemId: string;
  title: string;
  image?: string;
  url?: string;
  price?: number;
  currency: string;
  ownerName: string;
  at: string;
};

export const MAX_ITEMS = 200;
export const MAX_TITLE = 120;
export const MAX_NOTE = 500;

/**
 * Алфавит кода без букв и цифр, которые путают при переписывании от руки:
 * ни нуля с буквой O, ни единицы с I и L.
 */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;
const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

/** Как код показывают и диктуют: SW-K7QM4X с дефисом читается заметно легче. */
export const formatCode = (code: string): string => `SW-${code}`;

/**
 * Приводит введённое к каноническому виду. Принимает и «sw-k7q m4x», и целую
 * ссылку на список — люди чаще присылают ссылку, чем код.
 */
export function normalizeCode(input: string): string | null {
  const tail = input.trim().split(/[?#]/)[0].split("/").filter(Boolean).pop() ?? "";
  const code = tail.toUpperCase().replace(/^SW[-_ ]?/, "").replace(/[^A-Z0-9]/g, "");
  return CODE_RE.test(code) ? code : null;
}

export const clip = (value: string, max: number): string => value.trim().slice(0, max);

/** Ссылка «http(s)://…» и ничего больше: javascript: в чужом списке ни к чему. */
export function safeUrl(input?: string): string | undefined {
  const raw = input?.trim();
  if (!raw) return undefined;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.toString().slice(0, 600);
  } catch {
    return undefined;
  }
}
