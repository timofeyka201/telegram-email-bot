import type { Product } from "./types";

/**
 * Ссылка «в магазин».
 *
 * Для товаров AliExpress ведёт через свой переход `/api/go/<id>`: там к ссылке
 * добавляется партнёрская метка, по которой засчитывается комиссия, и там же
 * считается, сколько людей ушло покупать. Для всего остального — обычный адрес
 * товара.
 */
export function shopUrl(product: Pick<Product, "id" | "url" | "source">): string {
  return product.source === "ae" ? `/api/go/${encodeURIComponent(product.id)}` : product.url;
}

/** То же, но пригодное для буфера обмена и писем: с адресом сайта. */
export function shopUrlAbsolute(product: Pick<Product, "id" | "url" | "source">): string {
  const path = shopUrl(product);
  if (!path.startsWith("/")) return path;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}${path}`;
}
