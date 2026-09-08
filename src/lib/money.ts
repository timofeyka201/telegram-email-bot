/** Символы валют, которые встречаются у наших источников. */
const SYMBOL: Record<string, string> = { CNY: "¥", USD: "$", EUR: "€", RUB: "₽" };

/** Курс к рублю по умолчанию — пользователь правит его в корзине. */
export const DEFAULT_RATES: Record<string, number> = { CNY: 12.4, USD: 88, EUR: 96, RUB: 1 };

export function symbolOf(currency: string): string {
  return SYMBOL[currency] ?? currency + " ";
}

/** Цена в валюте товара: ¥68, $9.99 */
export function formatNative(value: number | undefined, currency: string): string {
  if (value === undefined) return "—";
  const s = symbolOf(currency);
  return `${s}${value % 1 === 0 ? value : value.toFixed(2)}`;
}

export function rateFor(currency: string, rates: Record<string, number>): number {
  return rates[currency] ?? DEFAULT_RATES[currency] ?? 1;
}

export function toRub(value: number | undefined, currency: string, rates: Record<string, number>): number | undefined {
  if (value === undefined) return undefined;
  return value * rateFor(currency, rates);
}

export function formatRub(value: number | undefined, currency: string, rates: Record<string, number>): string {
  const rub = toRub(value, currency, rates);
  if (rub === undefined) return "—";
  const rounded = rub >= 10 ? Math.round(rub) : Math.round(rub * 10) / 10;
  return `${rounded.toLocaleString("ru-RU")} ₽`;
}

export function priceRange(price: number | undefined, priceMax: number | undefined, currency: string): string {
  if (price === undefined) return "Цена по запросу";
  if (priceMax !== undefined && priceMax > price) return `${formatNative(price, currency)} – ${formatNative(priceMax, currency)}`;
  return formatNative(price, currency);
}

/** Для рублёвых товаров пересчёт совпадает с ценой — второй раз не показываем. */
export function needsConversion(currency: string): boolean {
  return currency !== "RUB";
}

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export function compact(n?: number): string {
  if (n === undefined) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".0", "")} млн`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(".0", "")} тыс.`;
  return String(n);
}
