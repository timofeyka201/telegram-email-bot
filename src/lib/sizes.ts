/**
 * Размеры одежды и обуви.
 *
 * Нужны в двух местах: чтобы отметить в карточке «ваш размер» и чтобы показать
 * таблицу соответствий — у китайских и европейских размеров она разная, и это
 * первая причина возвратов.
 */

export type SizeProfile = {
  height?: number; // см
  chest?: number; // обхват груди, см
  waist?: number; // талия, см
  hips?: number; // бёдра, см
  foot?: number; // длина стопы, см
  /** любимые буквенные размеры, как человек их сам называет */
  clothing?: string;
  shoes?: string;
};

export const emptySizes = (): SizeProfile => ({});

export function hasSizes(p?: SizeProfile): boolean {
  return !!p && Object.values(p).some((v) => v !== undefined && v !== "");
}

export type SizeRow = { label: string; values: string[] };
export type SizeTable = { id: string; title: string; note: string; columns: string[]; rows: SizeRow[] };

/** Таблицы намеренно короткие: длинная простыня не помогает выбрать. */
export const SIZE_TABLES: SizeTable[] = [
  {
    id: "clothing",
    title: "Одежда",
    note: "Китайские размеры меньше европейских примерно на один шаг. Если между двумя — берите больший.",
    columns: ["RU", "INT", "Китай", "Грудь, см", "Талия, см"],
    rows: [
      { label: "42", values: ["42", "XS", "M", "82–86", "62–66"] },
      { label: "44", values: ["44", "S", "L", "86–90", "66–70"] },
      { label: "46", values: ["46", "M", "XL", "90–94", "70–74"] },
      { label: "48", values: ["48", "L", "2XL", "94–98", "74–78"] },
      { label: "50", values: ["50", "XL", "3XL", "98–102", "78–82"] },
      { label: "52", values: ["52", "2XL", "4XL", "102–107", "82–87"] },
      { label: "54", values: ["54", "3XL", "5XL", "107–112", "87–92"] },
    ],
  },
  {
    id: "shoes",
    title: "Обувь",
    note: "Ориентируйтесь на длину стопы: буквенные размеры у разных продавцов расходятся.",
    columns: ["RU", "EU", "US", "Стопа, см"],
    rows: [
      { label: "36", values: ["36", "37", "6", "23,0"] },
      { label: "37", values: ["37", "38", "7", "23,5"] },
      { label: "38", values: ["38", "39", "8", "24,5"] },
      { label: "39", values: ["39", "40", "8,5", "25,0"] },
      { label: "40", values: ["40", "41", "9", "25,5"] },
      { label: "41", values: ["41", "42", "10", "26,5"] },
      { label: "42", values: ["42", "43", "10,5", "27,0"] },
      { label: "43", values: ["43", "44", "11", "28,0"] },
      { label: "44", values: ["44", "45", "12", "28,5"] },
    ],
  },
];

const CLOTHING_HINT = /одежд|рубаш|плать|футбол|худи|свитшот|куртк|джинс|топ|shirt|dress|hoodie|jacket|clothing|tops/i;
const SHOES_HINT = /обув|кроссов|ботин|туфл|сандал|shoe|sneaker|boot/i;

/** Какая таблица уместна для товара — и уместна ли вообще. */
export function tableFor(category?: string, title?: string): SizeTable | null {
  const text = `${category ?? ""} ${title ?? ""}`;
  if (SHOES_HINT.test(text)) return SIZE_TABLES[1];
  if (CLOTHING_HINT.test(text)) return SIZE_TABLES[0];
  return null;
}

/** Подсказка по строке таблицы: совпадает ли она с профилем пользователя. */
export function matchesProfile(table: SizeTable, row: SizeRow, profile: SizeProfile): boolean {
  if (table.id === "shoes") {
    if (profile.shoes && row.label === profile.shoes.trim()) return true;
    if (profile.foot !== undefined) {
      const cm = Number(row.values[3].replace(",", "."));
      return Math.abs(cm - profile.foot) < 0.4;
    }
    return false;
  }
  if (profile.clothing && row.values.some((v) => v.toLowerCase() === profile.clothing!.trim().toLowerCase())) return true;
  if (profile.chest !== undefined) {
    const [from, to] = row.values[3].split("–").map((n) => Number(n));
    return profile.chest >= from && profile.chest <= to;
  }
  return false;
}
