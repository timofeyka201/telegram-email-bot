import type { Product } from "./types";

/**
 * Поиск по витрине.
 *
 * Раньше поиск был одной строкой: `title.includes(запрос)`. Этого хватает,
 * пока ищут одно слово в том же падеже, в каком оно стоит в названии, — то
 * есть почти никогда. «Красное платье» не находило «Платье женское красное»,
 * «кроссовки» не находили «Кроссовки мужские» только из-за заглавной буквы в
 * другом месте, а «платья» не находили «платье». Хуже того: если не нашлось
 * ничего, витрина молча показывала всё подряд — и выглядело это так, будто
 * поиск нашёл что-то совершенно постороннее.
 *
 * Здесь всё иначе:
 *
 *  • запрос разбирается на слова, и найтись должны все (а не фраза целиком);
 *  • слова сравниваются по основе, поэтому падежи и числа не мешают;
 *  • к слову подбираются известные синонимы — русский и английский, —
 *    потому что названия на витрине бывают и теми, и другими;
 *  • результат сортируется по близости к запросу, а не по вкусу: когда
 *    человек ищет конкретное, подстраиваться под его предпочтения поздно;
 *  • не нашлось — значит не нашлось. Никакой подмены выдачи.
 */

/** Больше двух тысяч результатов никто не пролистает, а память они занимают. */
const MAX_RESULTS = 2000;
/** Слов в запросе: остальное — шум, по которому ничего не найдётся. */
const MAX_TERMS = 6;
/** Короче четырёх букв основу не режем: от «дом» останется «д». */
const MIN_STEM = 4;

/** Окончания от длинных к коротким: отрезаем первое подошедшее. */
const RU_ENDINGS = [
  "иями", "ями", "ами", "иях", "ях", "ах", "ией", "ием", "ние", "ния", "нию",
  "ого", "его", "ому", "ему", "ыми", "ими", "ых", "их", "ом", "ем", "ов", "ев",
  "ой", "ый", "ий", "ая", "яя", "ое", "ее", "ые", "ие", "ию", "ую", "юю", "ью",
  "ым", "им", "ам", "ям",
  // Беглая гласная: «кроссовок» — это «кроссовки», и без этих двух строк
  // родительный падеж множественного числа не находил ничего.
  "ок", "ек",
  "а", "я", "ы", "и", "о", "е", "у", "ю", "й", "ь",
];
const EN_ENDINGS = ["ies", "es", "s"];

/**
 * Синонимы. Названия на AliExpress приходят и по-русски, и по-английски, в
 * одной витрине вперемешку, поэтому «платье» должно находить dress, а
 * «sneakers» — кроссовки. Список намеренно короткий и бытовой: это не
 * словарь, а список того, что люди ищут чаще всего. Дополнять его можно
 * прямо здесь.
 */
const SYNONYMS: string[][] = [
  ["платье", "сарафан", "dress"],
  ["футболка", "майка", "tshirt", "shirt", "tee"],
  ["рубашка", "сорочка", "shirt", "blouse"],
  ["блузка", "блуза", "blouse"],
  ["куртка", "ветровка", "jacket"],
  ["пальто", "плащ", "coat"],
  ["пуховик", "down", "parka"],
  ["худи", "толстовка", "свитшот", "hoodie", "sweatshirt"],
  ["свитер", "джемпер", "кофта", "sweater", "pullover", "cardigan"],
  ["брюки", "штаны", "pants", "trousers"],
  ["джинсы", "jeans", "denim"],
  ["шорты", "shorts"],
  ["юбка", "skirt"],
  ["костюм", "suit"],
  ["бельё", "белье", "трусы", "underwear", "lingerie"],
  ["купальник", "swimsuit", "bikini"],
  ["носки", "socks"],
  ["кроссовки", "кеды", "sneakers", "trainers"],
  ["ботинки", "сапоги", "boots"],
  ["туфли", "обувь", "shoes"],
  ["тапочки", "slippers"],
  ["сумка", "сумочка", "bag", "handbag"],
  ["рюкзак", "backpack"],
  ["кошелёк", "кошелек", "wallet", "purse"],
  ["часы", "watch"],
  ["очки", "glasses", "sunglasses"],
  ["шапка", "кепка", "hat", "cap", "beanie"],
  ["перчатки", "gloves"],
  ["ремень", "пояс", "belt"],
  ["шарф", "scarf"],
  ["кольцо", "ring"],
  ["серьги", "earrings"],
  ["браслет", "bracelet"],
  ["цепочка", "ожерелье", "necklace", "chain"],
  ["телефон", "смартфон", "phone", "smartphone"],
  ["чехол", "case", "cover"],
  ["наушники", "headphones", "earbuds", "earphones"],
  ["зарядка", "зарядное", "charger"],
  ["кабель", "провод", "cable"],
  ["колонка", "speaker"],
  ["ноутбук", "laptop", "notebook"],
  ["клавиатура", "keyboard"],
  ["мышь", "mouse"],
  ["лампа", "светильник", "lamp", "light"],
  ["игрушка", "toy"],
  ["рюкзачок", "backpack"],
  ["палатка", "tent"],
  ["удочка", "спиннинг", "rod", "fishing"],
  ["женский", "женская", "женские", "women", "woman", "female"],
  ["мужской", "мужская", "мужские", "men", "man", "male"],
  ["детский", "детская", "детские", "kids", "baby", "child"],
  ["красный", "красная", "красное", "red"],
  ["чёрный", "черный", "чёрная", "черная", "black"],
  ["белый", "белая", "белое", "white"],
  ["синий", "синяя", "голубой", "blue"],
  ["зелёный", "зеленый", "зелёная", "green"],
  ["жёлтый", "желтый", "yellow"],
  ["розовый", "розовая", "pink"],
  ["серый", "серая", "grey", "gray"],
  ["бежевый", "beige"],
  ["кожаный", "кожа", "leather"],
  ["зимний", "зимняя", "зимние", "winter"],
  ["летний", "летняя", "летние", "summer"],
  ["помада", "lipstick"],
  ["духи", "парфюм", "perfume", "fragrance"],
  ["тушь", "mascara"],
  ["крем", "cream"],
  ["шампунь", "shampoo"],
  ["зеркало", "mirror"],
  ["стол", "table", "desk"],
  ["стул", "кресло", "chair"],
  ["кровать", "bed"],
  ["диван", "sofa", "couch"],
  ["телевизор", "tv", "television"],
  ["холодильник", "fridge", "refrigerator"],
  ["кастрюля", "pot"],
  ["сковорода", "pan", "skillet"],
  ["нож", "knife"],
  ["кружка", "чашка", "mug", "cup"],
  ["бутылка", "термос", "bottle", "thermos"],
  ["полотенце", "towel"],
  ["подушка", "pillow", "cushion"],
  ["одеяло", "плед", "blanket"],
  ["шторы", "занавески", "curtains"],
  ["ковёр", "ковер", "carpet", "rug"],
  // Марки пишут и так, и так — «чехол на айфон» обязан находить iPhone.
  ["айфон", "iphone", "apple", "эпл"],
  ["самсунг", "samsung"],
  ["ксиоми", "сяоми", "xiaomi", "redmi"],
  ["хуавей", "huawei"],
  ["найк", "nike"],
  ["адидас", "adidas"],
  ["пума", "puma"],
  ["зара", "zara"],
];

/**
 * Предлоги и союзы. В запросе они есть («чехол на айфон», «платье для
 * девочки»), а в названиях товаров — нет, и требовать их наличия значит
 * ронять поиск на ровном месте: без этого списка «чехол на айфон» не находил
 * чехол для айфона.
 */
const STOPWORDS = new Set([
  "на", "для", "из", "по", "с", "со", "в", "во", "и", "от", "до", "при", "без",
  "к", "ко", "у", "о", "об", "за", "под", "над", "про", "или", "the", "for",
  "with", "and", "of", "in", "to", "a",
]);

/** Нижний регистр, ё как е, всё кроме букв и цифр — пробел. */
export function normalize(text: string): string {
  return ` ${text.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]+/gi, " ").trim()} `;
}

/** Основа слова: отрезаем окончание, если под ним остаётся достаточно букв. */
export function stem(word: string): string {
  const endings = /[а-я]/.test(word) ? RU_ENDINGS : EN_ENDINGS;
  for (const end of endings) {
    if (word.length - end.length >= MIN_STEM && word.endsWith(end)) return word.slice(0, -end.length);
  }
  return word;
}

/** Основа → все основы её группы синонимов. Строится один раз. */
const BY_STEM = new Map<string, string[]>();
for (const group of SYNONYMS) {
  const stems = [...new Set(group.map((w) => stem(normalize(w).trim())))];
  for (const s of stems) BY_STEM.set(s, [...new Set([...(BY_STEM.get(s) ?? []), ...stems])]);
}

/**
 * Слова запроса, каждое — со своими синонимами. Найтись должна вся группа
 * целиком (достаточно любого слова из неё), а групп — сколько слов в запросе.
 */
export function queryTerms(query: string): Term[] {
  const words = normalize(query).trim().split(" ").filter(Boolean);
  const terms: Term[] = [];
  const used = new Set<string>();
  for (const word of words.slice(0, MAX_TERMS)) {
    if (word.length < 2 || STOPWORDS.has(word)) continue;
    const base = stem(word);
    if (used.has(base)) continue;
    used.add(base);
    terms.push({ base, all: BY_STEM.get(base) ?? [base] });
  }
  return terms;
}

/** Слово найдено, если с него начинается какое-нибудь слово в тексте. */
const hit = (hay: string, s: string) => hay.includes(` ${s}`);

/** Слово запроса и его синонимы. База — то, что человек набрал сам. */
type Term = { base: string; all: string[] };

type Hay = { title: string; rest: string };

/** Разобранные тексты карточек. Пересобираются, только когда сменился снапшот. */
let hayCache: { source: Product[]; hay: Hay[] } | null = null;

function haystacks(all: Product[]): Hay[] {
  if (hayCache?.source === all) return hayCache.hay;
  const hay = all.map((p) => ({
    title: normalize(p.title),
    // Остальное весит меньше названия, но по нему тоже ищут: «Nike», «обувь»,
    // название магазина.
    rest: normalize(
      [p.brand, p.category, p.seller?.name, ...p.attributes.slice(0, 12).map((a) => `${a.name} ${a.value}`)]
        .filter(Boolean)
        .join(" "),
    ),
  }));
  hayCache = { source: all, hay };
  return hay;
}

/**
 * Насколько карточка отвечает запросу. Ноль — не отвечает вовсе.
 * `need` — сколько групп слов обязаны найтись: сперва спрашиваем все, и
 * только если не нашлось ничего, соглашаемся на одну.
 */
function relevance(p: Product, h: Hay, terms: Term[], phrase: string, need: number): number {
  let found = 0;
  let score = 0;
  for (const term of terms) {
    // Своё слово ценнее синонима: по запросу «худи» первым должно идти худи,
    // а не свитшот, даже если по смыслу это соседи.
    const own = hit(h.title, term.base) ? 4 : hit(h.rest, term.base) ? 1.5 : 0;
    const alias = own ? 0 : term.all.some((s) => hit(h.title, s)) ? 2.5 : term.all.some((s) => hit(h.rest, s)) ? 1 : 0;
    if (!own && !alias) continue;
    found += 1;
    score += own || alias;
  }
  if (found < need) return 0;

  // Запрос целиком в названии — это именно то, что искали.
  if (phrase.length > 2 && h.title.includes(phrase)) score += 8;
  // Слово в начале названия весит больше: там стоит сам предмет.
  if (terms[0]?.all.some((s) => h.title.startsWith(` ${s}`))) score += 2;
  // Короткое название точнее длинного перечисления ключевых слов.
  score += Math.max(0, 1 - h.title.length / 140);
  // Популярность и оценка — только как разделитель равных.
  score += Math.min(1, Math.log10(1 + (p.soldCount ?? 0)) / 6);
  if (p.rating) score += (p.rating - 4) * 0.25;
  return score;
}

export type SearchResult = {
  /** Лучшие совпадения по убыванию близости к запросу. */
  ranked: Product[];
  /** Сколько нашлось всего — это число видит человек. */
  total: number;
  /** Нашлось только по части слов: строгий поиск не дал ничего. */
  loose: boolean;
};

let resultCache: { source: Product[]; key: string; result: SearchResult } | null = null;

/**
 * Поиск по снапшоту. Результат запоминается до следующего запроса: страницы
 * ленты приходят одна за другой по одному и тому же запросу, и пересчитывать
 * сто тысяч карточек на каждую незачем.
 *
 * `accept` отсеивает по фильтрам панели, `filterKey` описывает их строкой —
 * по нему и запросу результат находится в памяти.
 */
export function searchCatalog(
  all: Product[],
  query: string,
  opts: { accept?: (p: Product) => boolean; filterKey?: string } = {},
): SearchResult {
  const terms = queryTerms(query);
  const key = `${normalize(query)}|${opts.filterKey ?? ""}`;
  if (resultCache?.source === all && resultCache.key === key) return resultCache.result;

  const empty: SearchResult = { ranked: [], total: 0, loose: false };
  if (!terms.length) return empty;

  const hay = haystacks(all);
  const phrase = normalize(query);
  const accept = opts.accept;

  const collect = (need: number) => {
    const found: { p: Product; s: number }[] = [];
    for (let i = 0; i < all.length; i++) {
      const p = all[i];
      if (accept && !accept(p)) continue;
      const s = relevance(p, hay[i], terms, phrase, need);
      if (s > 0) found.push({ p, s });
    }
    found.sort((a, b) => b.s - a.s);
    return found;
  };

  let found = collect(terms.length);
  let loose = false;
  // Все слова вместе не нашлись — ищем хотя бы по одному. Это честнее пустого
  // экрана: «красное платье в горошек» найдёт красные платья.
  if (!found.length && terms.length > 1) {
    found = collect(1);
    loose = found.length > 0;
  }

  const result: SearchResult = {
    ranked: found.slice(0, MAX_RESULTS).map((x) => x.p),
    total: found.length,
    loose,
  };
  resultCache = { source: all, key, result };
  return result;
}
