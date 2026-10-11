/**
 * Название категории для кнопки фильтра.
 *
 * Общий код импортёра и починки снапшота: правило обрезки должно быть одно,
 * иначе после правки половина карточек окажется с одним названием, половина
 * с другим — и в ленте это будут две разные кнопки.
 */
export const CATEGORY_LIMIT = 34;

/**
 * Категория товара в фиде не приходит — её заменяет название фида или
 * категории внутри него. Названия у них длинные («Дом, сад и офис.
 * Обустройство дома и инструменты. Бытовая техника»), а в ленте это подпись
 * на кнопке, поэтому берём первую часть и режем по границе слова.
 */
export function shortCategory(feedTitle) {
  const head = String(feedTitle ?? "").split(/[.;]/)[0].trim();
  if (!head) return undefined;
  if (head.length <= CATEGORY_LIMIT) return head;

  const part = head.split(",")[0].trim();
  if (part.length <= CATEGORY_LIMIT) return part;

  const cut = part.slice(0, CATEGORY_LIMIT);
  const space = cut.lastIndexOf(" ");
  return (space > CATEGORY_LIMIT * 0.5 ? cut.slice(0, space) : cut).replace(/[\s,–—-]+$/, "");
}

/**
 * Как обрезал прежний импортёр: вслепую по 28 символам. Нужно, чтобы узнать
 * в снапшоте старые названия вроде «Телефоны и телекоммуникацион» и заменить
 * их целыми.
 */
export function legacyShortCategory(feedTitle) {
  const head = String(feedTitle ?? "").split(/[.;]/)[0].trim();
  if (!head) return undefined;
  return head.length <= 28 ? head : head.split(",")[0].trim().slice(0, 28);
}
