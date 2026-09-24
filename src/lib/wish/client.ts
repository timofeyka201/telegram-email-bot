"use client";

import { useStore } from "@/lib/store";
import type { Product } from "@/lib/types";
import type { FriendView, OwnerView, ReservedEntry } from "./types";

/**
 * Вишлист гостя живёт в браузере, как и раньше: пока человек не вошёл,
 * делиться списком всё равно не с кем. После входа единственная правда —
 * сервер, а локальный список остаётся его копией: по ней мгновенно
 * закрашивается закладка в карточке товара и работает слежение за ценой.
 */

const isLoggedIn = () => !!useStore.getState().account;

async function call<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store", ...init });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/** Товары из ленты, лежащие в серверном списке, — для локальной копии. */
const productsOf = (view: OwnerView): Product[] =>
  view.items.map((i) => i.product).filter((p): p is Product => !!p);

/** Ответ сервера — истина: приводим к нему и копию, и счётчик в меню. */
function apply(view: OwnerView): OwnerView {
  const store = useStore.getState();
  store.setWishlist(productsOf(view));
  store.setWishTotal(view.items.length);
  return view;
}

/**
 * Загрузка своего списка. Заодно доносит на сервер то, что человек успел
 * отложить до входа: повторы отсекаются по id товара, так что вызывать
 * можно сколько угодно раз.
 */
export async function loadMyWishlist(): Promise<OwnerView | null> {
  if (!isLoggedIn()) return null;
  const local = useStore.getState().wishlist;
  const data = local.length
    ? await call<{ wishlist: OwnerView }>("/api/wishlist/items", jsonInit("POST", { products: local }))
    : await call<{ wishlist: OwnerView }>("/api/wishlist");
  if (!data?.wishlist) return null;
  return apply(data.wishlist);
}

/** Закладку нажали в карточке товара: повторяем действие на сервере. */
export function pushWish(product: Product, wished: boolean): void {
  const store = useStore.getState();
  if (!store.account) return;
  // Счётчик в меню поправляем сразу, не дожидаясь ответа: список всё равно
  // перечитается при следующем открытии страницы, а значок дёргаться не должен.
  if (store.wishTotal !== null) store.setWishTotal(Math.max(0, store.wishTotal + (wished ? 1 : -1)));
  void (wished
    ? call("/api/wishlist/items", jsonInit("POST", { products: [product] }))
    : call(`/api/wishlist/items/${encodeURIComponent(product.id)}`, { method: "DELETE" }));
}

export async function saveWishlistSettings(patch: {
  title?: string;
  note?: string;
  shared?: boolean;
}): Promise<OwnerView | null> {
  const data = await call<{ wishlist: OwnerView }>("/api/wishlist", jsonInit("PATCH", patch));
  return data?.wishlist ?? null;
}

export type CustomCard = { title: string; price?: number; currency?: string; url?: string; image?: string; note?: string };

export async function addCustomCard(item: CustomCard): Promise<{ wishlist?: OwnerView; error?: string }> {
  try {
    const res = await fetch("/api/wishlist/items", jsonInit("POST", { item }));
    const data = (await res.json()) as { wishlist?: OwnerView; error?: string };
    if (!res.ok || !data.wishlist) return { error: data.error ?? "Не удалось сохранить" };
    return { wishlist: apply(data.wishlist) };
  } catch {
    return { error: "Нет связи с сервером" };
  }
}

/** null в цене — «убрать цену»: отличить его от «не трогать» иначе нечем. */
export type CardPatch = Partial<Omit<CustomCard, "price">> & { price?: number | null };

export async function patchItem(id: string, patch: CardPatch): Promise<OwnerView | null> {
  const data = await call<{ wishlist: OwnerView }>(`/api/wishlist/items/${encodeURIComponent(id)}`, jsonInit("PATCH", patch));
  return data?.wishlist ? apply(data.wishlist) : null;
}

export async function removeItem(id: string): Promise<OwnerView | null> {
  const data = await call<{ wishlist: OwnerView }>(`/api/wishlist/items/${encodeURIComponent(id)}`, { method: "DELETE" });
  return data?.wishlist ? apply(data.wishlist) : null;
}

export type FriendResult =
  | { kind: "ok"; wishlist: FriendView }
  | { kind: "mine" }
  | { kind: "error"; message: string };

export async function loadFriendWishlist(code: string): Promise<FriendResult> {
  try {
    const res = await fetch(`/api/wishlist/${encodeURIComponent(code)}`, { cache: "no-store" });
    const data = (await res.json()) as { wishlist?: FriendView; mine?: boolean; error?: string };
    if (data.mine) return { kind: "mine" };
    if (!res.ok || !data.wishlist) return { kind: "error", message: data.error ?? "Не получилось открыть список" };
    return { kind: "ok", wishlist: data.wishlist };
  } catch {
    return { kind: "error", message: "Нет связи с сервером" };
  }
}

export async function toggleReserve(
  code: string,
  itemId: string,
  on: boolean,
): Promise<{ wishlist?: FriendView; error?: string }> {
  try {
    const res = await fetch(`/api/wishlist/${encodeURIComponent(code)}/reserve`, jsonInit("POST", { itemId, on }));
    const data = (await res.json()) as { wishlist?: FriendView; error?: string };
    if (!res.ok) return { error: data.error ?? "Не получилось", wishlist: data.wishlist };
    return { wishlist: data.wishlist };
  } catch {
    return { error: "Нет связи с сервером" };
  }
}

export async function loadReservations(): Promise<ReservedEntry[]> {
  const data = await call<{ reservations: ReservedEntry[] }>("/api/wishlist/reserved");
  return data?.reservations ?? [];
}
