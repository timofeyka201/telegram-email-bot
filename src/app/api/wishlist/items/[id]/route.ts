import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/session";
import { myWishlist, ownerView, saveWishlist } from "@/lib/wish/server";
import { clip, MAX_NOTE, MAX_TITLE, safeUrl, type WishItem } from "@/lib/wish/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
type Params = { params: Promise<{ id: string }> };

/**
 * Карточку из ленты закладка в товаре убирает по id товара — id желания
 * ей взять неоткуда. Uuid желания и id товара не пересекаются, так что
 * одного адреса хватает на оба случая.
 */
const matches = (id: string) => (item: WishItem) => item.id === id || item.product?.id === id;

/** Правка своей карточки: название, цена, ссылка, фото и пожелание к подарку. */
export async function PATCH(req: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Нужен вход" }, { status: 401 });
  const { id } = await params;

  let body: { title?: string; price?: number | null; currency?: string; url?: string; image?: string; note?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const list = await myWishlist(user);
  const item = list.items.find(matches(id));
  if (!item) return NextResponse.json({ error: "Такого желания в списке нет" }, { status: 404 });

  if (typeof body.title === "string") {
    const title = clip(body.title, MAX_TITLE);
    if (!title) return NextResponse.json({ error: "Название не может быть пустым" }, { status: 400 });
    item.title = title;
  }
  if (body.price === null) item.price = undefined;
  else if (typeof body.price === "number" && Number.isFinite(body.price) && body.price >= 0) item.price = body.price;
  if (typeof body.currency === "string" && body.currency) item.currency = body.currency.slice(0, 8);
  if (typeof body.url === "string") item.url = safeUrl(body.url);
  if (typeof body.image === "string") item.image = safeUrl(body.image);
  if (typeof body.note === "string") item.note = clip(body.note, MAX_NOTE) || undefined;

  await saveWishlist(list);
  return NextResponse.json({ wishlist: ownerView(list) }, { headers: noStore });
}

export async function DELETE(_req: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Нужен вход" }, { status: 401 });
  const { id } = await params;

  const list = await myWishlist(user);
  const before = list.items.length;
  list.items = list.items.filter((i) => !matches(id)(i));
  if (list.items.length !== before) await saveWishlist(list);

  return NextResponse.json({ wishlist: ownerView(list) }, { headers: noStore });
}
