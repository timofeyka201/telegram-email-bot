/**
 * Отбраковка карточек.
 *
 * Часть открытых каталогов — публичные песочницы, куда кто угодно добавляет
 * записи: там встречаются «New Product 1789744084894» с картинкой-заглушкой.
 * Формально такие карточки валидны, поэтому проверка «изображение скачалось»
 * их пропускает — отсеивать приходится по смыслу.
 */

/** Хосты, которые отдают сгенерированную заглушку вместо фотографии товара. */
const PLACEHOLDER_HOSTS = [
  "placehold.co", "placeholder.com", "via.placeholder.com", "dummyimage.com",
  "placekitten.com", "placeimg.com", "lorempixel.com", "fakeimg.pl",
  "encrypted-tbn0.gstatic.com", "encrypted-tbn1.gstatic.com",
];

/** Заготовки названий, которые оставляют в песочницах вместо настоящих. */
const JUNK_TITLE = [
  /^new\s*product/i,
  /^title-[0-9a-f-]{8,}/i,
  /^hotelwb-/i,
  /^product\s*\d*$/i,
  /^test\b/i,
  /^[0-9\s.-]+$/,
];

export function imageLooksReal(url) {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return false;
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return !PLACEHOLDER_HOSTS.some((h) => host === h || host.endsWith("." + h));
}

/**
 * Строгость зависит от источника. Кураторские каталоги отдают и короткие
 * настоящие названия («Apple», «Milk»), поэтому к ним придираться нельзя.
 * Песочницы, куда пишет кто угодно, проверяем жёстче.
 */
export function titleLooksReal(title, { strict = false } = {}) {
  if (typeof title !== "string") return false;
  const t = title.trim();
  if (t.length < 3 || t.length > 200) return false;
  if (JUNK_TITLE.some((re) => re.test(t))) return false;
  // Длинный хвост из случайных символов — признак автогенерации.
  if (/[0-9a-f]{12,}/i.test(t)) return false;
  if (strict) {
    // В песочнице настоящее название состоит хотя бы из двух слов:
    // так отсеиваются «CARZZZZZZ» и «jhgs».
    if (t.length < 8 || !/\s/.test(t)) return false;
  }
  return true;
}

/** Песочницы, к которым применяем строгие правила: там пишет кто угодно. */
const SANDBOX_PREFIX = ["pz-"];

export function isSandbox(product) {
  return SANDBOX_PREFIX.some((prefix) => String(product?.id ?? "").startsWith(prefix));
}

/** Товар годится, если у него осмысленное название, цена и хотя бы одно настоящее фото. */
export function productLooksReal(p, opts) {
  const strict = opts?.strict ?? isSandbox(p);
  if (!p || !titleLooksReal(p.title, { strict })) return false;
  if (typeof p.price !== "number" || p.price <= 0) return false;
  const images = (p.images ?? []).filter(imageLooksReal);
  return images.length > 0;
}

/** Оставляет только годные карточки и убирает у них заглушки из списка фото. */
export function keepReal(products, opts) {
  return products
    .filter((p) => productLooksReal(p, opts))
    .map((p) => ({ ...p, images: p.images.filter(imageLooksReal) }));
}
