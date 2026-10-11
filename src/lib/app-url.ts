import { headers } from "next/headers";

/**
 * Адрес приложения для ссылок, которые уходят наружу: в письма, в
 * og-разметку, в кнопку «поделиться».
 *
 * Берём из настройки, иначе собираем из заголовков запроса — за обратным
 * прокси там уже стоит настоящий домен.
 */
export async function appUrl(): Promise<string> {
  const clean = (v?: string | null) => v?.trim().replace(/\/+$/, "") || "";
  const configured = clean(process.env.APP_URL) || clean(process.env.NEXT_PUBLIC_APP_URL);
  if (configured) return configured;

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) {
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    return `${proto}://${host}`;
  }
  const vercel = clean(process.env.VERCEL_PROJECT_PRODUCTION_URL) || clean(process.env.VERCEL_URL);
  return vercel ? `https://${vercel}` : "http://localhost:3000";
}
