import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/session";
import { buildItem, myWishlist, ownerView, roomFor, saveWishlist } from "@/lib/wish/server";
import { clip, MAX_ITEMS, MAX_NOTE, MAX_TITLE, safeUrl } from "@/lib/wish/types";
import type { Product } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

type Body = {
  /** Своя карточка: ссылка, фото, название, цена. */
  item?: { title?: string; price?: number; currency?: string; url?: string; image?: string; note?: string };
  /** Карточки из ленты — одна или пачкой при переносе старого вишлиста. */
  products?: Product[];
};

/**
 * Добавление. Карточка из ленты узнаётся по product.id: повторное нажатие
 * закладки не должно плодить дубликаты, а перенос локального вишлиста после
 * входа обязан быть безопасным при любом числе повторов.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Нужен вход" }, { status: 401 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const list = await myWishlist(user);
  let added = 0;

  for (const product of (body.products ?? []).slice(0, MAX_ITEMS)) {
    if (!product?.id || typeof product.title !== "string") continue;
    if (list.items.some((i) => i.product?.id === product.id)) continue;
    if (!roomFor(list)) break;
    list.items.unshift(
      buildItem({
        source: "swiper",
        title: product.title,
        price: product.price,
        currency: product.currency,
        url: product.url,
        image: product.images?.[0],
        product,
      }),
    );
    added += 1;
  }

  if (body.item) {
    const title = clip(body.item.title ?? "", MAX_TITLE);
    if (!title) return NextResponse.json({ error: "Без названия карточку не сохранить" }, { status: 400 });
    if (!roomFor(list)) {
      return NextResponse.json({ error: `В списке уже ${MAX_ITEMS} желаний — больше не поместится` }, { status: 409 });
    }
    list.items.unshift(
      buildItem({
        source: "custom",
        title,
        price: typeof body.item.price === "number" ? body.item.price : undefined,
        currency: body.item.currency || "RUB",
        url: safeUrl(body.item.url),
        image: safeUrl(body.item.image),
        note: body.item.note ? clip(body.item.note, MAX_NOTE) : undefined,
      }),
    );
    added += 1;
  }

  if (added) {
    try {
      await saveWishlist(list);
    } catch {
      return NextResponse.json({ error: "Список получился слишком большим" }, { status: 413 });
    }
  }

  return NextResponse.json({ wishlist: ownerView(list), added }, { headers: noStore });
}
