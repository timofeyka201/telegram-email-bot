/**
 * Категории приезжают из источников слагами на английском. В интерфейсе они
 * должны быть по-русски, поэтому здесь словарь, а для незнакомых значений —
 * аккуратный запасной вариант вместо «mens-shirts».
 */
const LABELS: Record<string, string> = {
  beauty: "Красота",
  fragrances: "Парфюмерия",
  furniture: "Мебель",
  groceries: "Продукты",
  "home-decoration": "Декор для дома",
  "kitchen-accessories": "Для кухни",
  laptops: "Ноутбуки",
  "mens-shirts": "Мужские рубашки",
  "mens-shoes": "Мужская обувь",
  "mens-watches": "Мужские часы",
  "mobile-accessories": "Аксессуары для телефона",
  motorcycle: "Мототехника",
  "skin-care": "Уход за кожей",
  smartphones: "Смартфоны",
  "sports-accessories": "Спорт",
  sunglasses: "Очки",
  tablets: "Планшеты",
  tops: "Топы",
  vehicle: "Авто",
  "womens-bags": "Женские сумки",
  "womens-dresses": "Платья",
  "womens-jewellery": "Украшения",
  "womens-shoes": "Женская обувь",
  "womens-watches": "Женские часы",
  clothes: "Одежда",
  shoes: "Обувь",
  electronics: "Электроника",
  jewelery: "Украшения",
  miscellaneous: "Разное",
  "men's clothing": "Мужская одежда",
  "women's clothing": "Женская одежда",
};

/**
 * Часть источников — публичные песочницы, откуда приезжают категории вроде
 * «Updated Category Name». Показывать их как настоящие нельзя.
 */
const JUNK_CATEGORY = [/updated\s*category/i, /^new\s*category/i, /^category[-\s]/i, /^test\b/i, /^string$/i];

export function categoryLabel(raw?: string): string {
  if (!raw) return "Без категории";
  const key = raw.trim().toLowerCase();
  if (LABELS[key]) return LABELS[key];
  if (JUNK_CATEGORY.some((re) => re.test(raw))) return "Разное";
  // Незнакомый слаг делаем читаемым: «garden-tools» → «Garden tools».
  const pretty = raw.replace(/[-_]+/g, " ").trim();
  return pretty.charAt(0).toUpperCase() + pretty.slice(1);
}

/** Категории, отсортированные по числу товаров: самые полные — первыми. */
export function rankCategories(products: { category?: string }[]): string[] {
  const counts = new Map<string, number>();
  for (const p of products) {
    if (!p.category) continue;
    counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
}
