import { safeUrl } from "./types";

/**
 * Чтение разметки страницы товара. Держится отдельно от запроса, потому что
 * это чистая работа с текстом: её можно проверить, не ходя в интернет.
 *
 * Разбираем только meta в <head> — Open Graph, twitter-карточку и микроданные
 * schema.org. Полноценный парсер HTML здесь не нужен: магазины, которые не
 * кладут og-теги, обычно и остальное прячут за JavaScript.
 */
export type LinkPreview = {
  title?: string;
  image?: string;
  price?: number;
  currency?: string;
};

const decode = (value: string): string =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    // Амперсанд — последним, иначе «&amp;lt;» превратится в «<».
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/** Ищем meta по property, name или itemprop — разметку пишут всеми тремя способами. */
function meta(html: string, keys: string[]): string | undefined {
  for (const key of keys) {
    const re = new RegExp(`<meta[^>]+(?:property|name|itemprop)\\s*=\\s*["']${key}["'][^>]*>`, "i");
    const tag = html.match(re)?.[0];
    const value = tag?.match(/content\s*=\s*["']([^"']*)["']/i)?.[1];
    if (value?.trim()) return decode(value);
  }
  return undefined;
}

/** «1 490,00 ₽» и «1490.00» должны дать одно и то же число. */
function toPrice(raw?: string): number | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/[^\d.,]/g, "").replace(/\s/g, "");
  if (!digits) return undefined;
  // Последний разделитель считаем десятичным, остальные — разрядными.
  const cut = Math.max(digits.lastIndexOf("."), digits.lastIndexOf(","));
  const normalized =
    cut >= 0 && digits.length - cut <= 3
      ? `${digits.slice(0, cut).replace(/[.,]/g, "")}.${digits.slice(cut + 1)}`
      : digits.replace(/[.,]/g, "");
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export function extractPreview(html: string, base: string): LinkPreview {
  const head = html.slice(0, 200_000);
  const titleTag = head.match(/<title[^>]*>([\s\S]{0,300}?)<\/title>/i)?.[1];
  const image = meta(head, ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src", "image"]);
  const currency = meta(head, ["product:price:currency", "og:price:currency", "priceCurrency"]);

  return {
    title: (meta(head, ["og:title", "twitter:title"]) ?? (titleTag ? decode(titleTag) : undefined))?.slice(0, 120),
    image: image ? safeUrl(new URL(image, base).toString()) : undefined,
    price: toPrice(meta(head, ["product:price:amount", "og:price:amount", "price"])),
    currency: currency && /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : undefined,
  };
}
