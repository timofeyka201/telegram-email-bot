import { NextResponse } from "next/server";
import { catalogProducts } from "@/lib/catalog";
import { affiliateLink, noteClick } from "@/lib/ae/links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Переход в магазин. Все ссылки «купить» ведут сюда, а не напрямую на
 * AliExpress: здесь к ним добавляется партнёрская метка, по которой
 * засчитывается комиссия, и здесь же считается самая денежная метрика —
 * сколько людей и по каким товарам уходят покупать.
 *
 * Если партнёрскую ссылку получить не удалось, человек всё равно уходит на
 * товар. Потерянная комиссия — неприятность, тупик вместо магазина — потеря
 * покупателя.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Идентификаторы с суффиксом круга («-r1») указывают на тот же товар.
  const base = id.replace(/-r\d+$/, "");
  const product = catalogProducts().find((p) => p.id === base);

  /*
   * Товара может не оказаться в снапшоте: витрина пересобирается каждую ночь,
   * и часть карточек уходит. Но ссылка на него остаётся в избранном, в корзине
   * и в списке заказов, и вести её в тупик нельзя. Адрес AliExpress выводится
   * из нашего же идентификатора «ae-<номер>», поэтому подставить его можно без
   * обращения к площадке. В адрес идут только цифры — чужую ссылку через наш
   * переход так не протащить.
   */
  const itemId = /^ae-(\d{6,20})$/.exec(base)?.[1];
  const url = product?.url ?? (itemId ? `https://aliexpress.ru/item/${itemId}.html` : undefined);
  if (!url) return new NextResponse("Нет такого товара", { status: 404 });

  const creative = await affiliateLink(base, url, product?.title ?? `Товар ${itemId}`);
  await noteClick(base, creative ? "affiliate" : "direct");

  return NextResponse.redirect(creative?.target ?? url, {
    status: 302,
    // Переход персональный и меняется вместе с настройками партнёрки —
    // кэшировать его ни браузеру, ни прокси не нужно.
    headers: { "Cache-Control": "no-store" },
  });
}
