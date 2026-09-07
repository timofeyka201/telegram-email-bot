export function formatCny(v?: number): string {
  if (v === undefined) return "—";
  return `¥${v % 1 === 0 ? v : v.toFixed(2)}`;
}

export function formatRub(cny: number | undefined, rate: number): string {
  if (cny === undefined) return "—";
  const rub = cny * rate;
  const rounded = rub >= 10 ? Math.round(rub) : Math.round(rub * 10) / 10;
  return `${rounded.toLocaleString("ru-RU")} ₽`;
}

export function priceLabel(price?: number, priceMax?: number): string {
  if (price === undefined) return "Цена по запросу";
  if (priceMax !== undefined && priceMax > price) return `${formatCny(price)} – ${formatCny(priceMax)}`;
  return formatCny(price);
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
