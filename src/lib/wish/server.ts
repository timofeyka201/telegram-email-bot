import { randomInt, randomUUID } from "node:crypto";
import { authStore, type UserRecord } from "@/lib/auth/store";
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  clip,
  MAX_ITEMS,
  MAX_NOTE,
  MAX_TITLE,
  type FriendItem,
  type FriendView,
  type OwnerItem,
  type OwnerView,
  type ReservedEntry,
  type WishItem,
  type Wishlist,
} from "./types";

const listKey = (userId: string) => `wish:${userId}`;
const codeKey = (code: string) => `wishcode:${code}`;
const reservedKey = (userId: string) => `wishres:${userId}`;

/** Список желаний на сотню карточек с картинками в полмегабайта не влезет — и не должен. */
const MAX_BYTES = 600_000;

export const displayName = (user: Pick<UserRecord, "name" | "email">): string =>
  user.name?.trim() || user.email.split("@")[0];

function newCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}

async function read(userId: string): Promise<Wishlist | null> {
  const raw = await authStore().getDoc(listKey(userId));
  if (!raw) return null;
  try {
    const list = JSON.parse(raw) as Wishlist;
    return { ...list, items: Array.isArray(list.items) ? list.items : [] };
  } catch {
    return null;
  }
}

async function write(list: Wishlist): Promise<void> {
  const payload = JSON.stringify({ ...list, updatedAt: Date.now() });
  if (payload.length > MAX_BYTES) throw new Error("WISHLIST_TOO_BIG");
  await authStore().putDoc(listKey(list.ownerId), payload);
}

/**
 * Список у каждого один и заводится сам при первом обращении: спрашивать
 * «создать вишлист?» там, где ответ всегда «да», незачем.
 *
 * Код занимается через claimDoc, поэтому два человека не получат один и тот
 * же: проигравший гонку просто возьмёт следующий.
 */
export async function myWishlist(user: UserRecord): Promise<Wishlist> {
  const existing = await read(user.id);
  if (existing) {
    const name = displayName(user);
    if (existing.ownerName !== name) {
      existing.ownerName = name;
      await write(existing);
    }
    return existing;
  }

  let code: string | null = null;
  for (let attempt = 0; attempt < 8 && !code; attempt += 1) {
    const candidate = newCode();
    if (await authStore().claimDoc(codeKey(candidate), user.id)) code = candidate;
  }
  if (!code) throw new Error("Не удалось выдать код списка — попробуйте ещё раз");

  const list: Wishlist = {
    code,
    ownerId: user.id,
    ownerName: displayName(user),
    title: "Мой вишлист",
    shared: true,
    items: [],
    createdAt: new Date().toISOString(),
    updatedAt: Date.now(),
  };
  await write(list);
  return list;
}

export async function saveWishlist(list: Wishlist): Promise<void> {
  await write(list);
}

export async function wishlistByCode(code: string): Promise<Wishlist | null> {
  const ownerId = await authStore().getDoc(codeKey(code));
  if (!ownerId) return null;
  const list = await read(ownerId);
  // Указатель «код → владелец» переживает сам список: считаем такой код мёртвым.
  return list && list.code === code ? list : null;
}

// ------------------------------------------------------------------- виды
const strip = ({ reserved: _reserved, ...rest }: WishItem): OwnerItem => rest;

export const ownerView = (list: Wishlist): OwnerView => ({
  code: list.code,
  title: list.title,
  note: list.note,
  shared: list.shared,
  ownerName: list.ownerName,
  items: list.items.map(strip),
  updatedAt: list.updatedAt,
});

export function friendView(list: Wishlist, viewerId: string | null): FriendView {
  const items: FriendItem[] = list.items.map((item) => {
    const mine = !!item.reserved && item.reserved.userId === viewerId;
    return {
      ...strip(item),
      reserved: !!item.reserved,
      mine,
      reservedBy: item.reserved ? (mine ? "вы" : item.reserved.name) : undefined,
    };
  });
  return {
    code: list.code,
    title: list.title,
    note: list.note,
    ownerName: list.ownerName,
    items,
    canReserve: !!viewerId && viewerId !== list.ownerId,
  };
}

// --------------------------------------------------------------- карточки
type NewItem = {
  source: "swiper" | "custom";
  title: string;
  price?: number;
  currency?: string;
  url?: string;
  image?: string;
  note?: string;
  product?: WishItem["product"];
};

export function buildItem(input: NewItem): WishItem {
  return {
    id: randomUUID(),
    source: input.source,
    title: clip(input.title, MAX_TITLE),
    price: Number.isFinite(input.price) && (input.price as number) >= 0 ? input.price : undefined,
    currency: input.currency || "RUB",
    url: input.url,
    image: input.image,
    note: input.note ? clip(input.note, MAX_NOTE) : undefined,
    addedAt: new Date().toISOString(),
    product: input.product,
  };
}

export const roomFor = (list: Wishlist): boolean => list.items.length < MAX_ITEMS;

// ------------------------------------------------------------------ брони
export type ReserveOutcome = "reserved" | "released" | "taken" | "missing" | "own";

/**
 * Бронь ставится и снимается одной атомарной правкой чужого списка: двое
 * дарителей, нажавших кнопку одновременно, не должны затереть друг друга.
 */
export async function reserve(
  ownerId: string,
  itemId: string,
  viewer: { id: string; name: string },
  on: boolean,
): Promise<{ outcome: ReserveOutcome; item?: WishItem }> {
  let outcome: ReserveOutcome = "missing";
  let snapshot: WishItem | undefined;

  await authStore().editDoc(listKey(ownerId), (raw) => {
    if (!raw) return null;
    let list: Wishlist;
    try {
      list = JSON.parse(raw) as Wishlist;
    } catch {
      return null;
    }
    if (list.ownerId === viewer.id) {
      outcome = "own";
      return null;
    }
    const item = (list.items ?? []).find((i) => i.id === itemId);
    if (!item) return null;

    if (on) {
      if (item.reserved && item.reserved.userId !== viewer.id) {
        outcome = "taken";
        return null;
      }
      item.reserved = { userId: viewer.id, name: viewer.name, at: new Date().toISOString() };
      outcome = "reserved";
    } else {
      if (item.reserved && item.reserved.userId !== viewer.id) {
        outcome = "taken";
        return null;
      }
      delete item.reserved;
      outcome = "released";
    }
    snapshot = item;
    // updatedAt списка не трогаем: владелец не должен заметить чужую бронь
    // даже по времени изменения.
    return JSON.stringify(list);
  });

  return { outcome, item: snapshot };
}

async function readReserved(userId: string): Promise<ReservedEntry[]> {
  const raw = await authStore().getDoc(reservedKey(userId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ReservedEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Памятка дарителя: что и в чьём списке он взял на себя. */
export async function noteReservation(userId: string, entry: ReservedEntry): Promise<void> {
  await authStore().editDoc(reservedKey(userId), (raw) => {
    let list: ReservedEntry[] = [];
    try {
      list = raw ? (JSON.parse(raw) as ReservedEntry[]) : [];
    } catch {
      list = [];
    }
    const rest = list.filter((e) => !(e.code === entry.code && e.itemId === entry.itemId));
    return JSON.stringify([entry, ...rest].slice(0, MAX_ITEMS));
  });
}

export async function forgetReservation(userId: string, code: string, itemId: string): Promise<void> {
  await authStore().editDoc(reservedKey(userId), (raw) => {
    if (!raw) return null;
    let list: ReservedEntry[] = [];
    try {
      list = JSON.parse(raw) as ReservedEntry[];
    } catch {
      return null;
    }
    return JSON.stringify(list.filter((e) => !(e.code === code && e.itemId === itemId)));
  });
}

/**
 * Памятка — производная запись, и она может разойтись с истиной: список
 * удалили, подарок убрали, бронь снял сам владелец. Поэтому при показе
 * сверяемся с самими списками и молча выбрасываем то, чего уже нет.
 */
export async function myReservations(userId: string): Promise<ReservedEntry[]> {
  const entries = await readReserved(userId);
  const alive: ReservedEntry[] = [];
  const byCode = new Map<string, Wishlist | null>();

  for (const entry of entries) {
    if (!byCode.has(entry.code)) byCode.set(entry.code, await wishlistByCode(entry.code));
    const list = byCode.get(entry.code);
    const item = list?.items.find((i) => i.id === entry.itemId);
    if (!item || item.reserved?.userId !== userId) continue;
    alive.push({ ...entry, title: item.title, image: item.image, url: item.url, price: item.price, currency: item.currency });
  }

  if (alive.length !== entries.length) {
    await authStore().putDoc(reservedKey(userId), JSON.stringify(alive));
  }
  return alive;
}

// ------------------------------------------------- защита от перебора кодов
const misses = new Map<string, { count: number; until: number }>();
const MISS_LIMIT = 40;
const MISS_WINDOW = 10 * 60 * 1000;

/** Кодов миллиард, но и миллиард можно ковырять — считаем промахи по адресу. */
export function tooManyMisses(key: string): boolean {
  const entry = misses.get(key);
  if (!entry) return false;
  if (entry.until < Date.now()) {
    misses.delete(key);
    return false;
  }
  return entry.count >= MISS_LIMIT;
}

export function noteMiss(key: string): void {
  const now = Date.now();
  const entry = misses.get(key);
  if (!entry || entry.until < now) misses.set(key, { count: 1, until: now + MISS_WINDOW });
  else entry.count += 1;
  if (misses.size > 5000) {
    for (const [k, v] of misses) if (v.until < now) misses.delete(k);
  }
}
