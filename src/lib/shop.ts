import type { Product } from "./types";

/**
 * Ссылка «в магазин».
 *
 * Для товаров AliExpress ведёт через свой переход `/api/go/<id>`: там к ссылке
 * добавляется партнёрская метка, по которой засчитывается комиссия, и там же
 * считается, сколько людей ушло покупать. Для всего остального — обычный адрес
 * товара.
 */
/** Откуда человек ушёл в магазин: это считается в статистике переходов. */
export type ShopFrom = "deck" | "likes" | "cart" | "wishlist" | "item" | "gift";

export function shopUrl(product: Pick<Product, "id" | "url" | "source">, from?: ShopFrom): string {
  if (product.source !== "ae") return product.url;
  const where = from ? `?from=${from}` : "";
  return `/api/go/${encodeURIComponent(product.id)}${where}`;
}

/** То же, но пригодное для буфера обмена и писем: с адресом сайта. */
export function shopUrlAbsolute(product: Pick<Product, "id" | "url" | "source">, from?: ShopFrom): string {
  const path = shopUrl(product, from);
  if (!path.startsWith("/")) return path;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}${path}`;
}

/**
 * Ссылка на карточку товара у нас. Ею делятся с людьми: она открывается без
 * приложения, показывает превью в мессенджере и ведёт в ленту, а дальше в
 * магазин — уже по партнёрской ссылке.
 */
export function cardUrl(product: Pick<Product, "id">): string {
  return `/t/${encodeURIComponent(product.id)}`;
}

/** То же с адресом сайта — для буфера обмена, писем и кнопки «поделиться». */
export function cardUrlAbsolute(product: Pick<Product, "id">): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}${cardUrl(product)}`;
}
