import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/session";
import {
  displayName,
  forgetReservation,
  friendView,
  noteReservation,
  reserve,
  wishlistByCode,
} from "@/lib/wish/server";
import { normalizeCode } from "@/lib/wish/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
type Params = { params: Promise<{ code: string }> };

/**
 * Бронь подарка. Смысл её в том, чтобы двое не подарили одно и то же, поэтому
 * занятое чужим показывается честно, а владельцу не показывается вовсе.
 */
export async function POST(req: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Войдите, чтобы бронировать подарки" }, { status: 401 });

  const { code: raw } = await params;
  const code = normalizeCode(raw);
  if (!code) return NextResponse.json({ error: "Такого кода не бывает" }, { status: 400 });

  let body: { itemId?: string; on?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  if (!body.itemId) return NextResponse.json({ error: "Не указан подарок" }, { status: 400 });

  const list = await wishlistByCode(code);
  if (!list) return NextResponse.json({ error: "Списка с таким кодом нет" }, { status: 404 });
  if (list.ownerId === user.id) {
    return NextResponse.json({ error: "Это ваш собственный список" }, { status: 400 });
  }
  if (!list.shared) return NextResponse.json({ error: "Владелец закрыл доступ к этому списку" }, { status: 403 });

  const on = body.on !== false;
  const { outcome, item } = await reserve(list.ownerId, body.itemId, { id: user.id, name: displayName(user) }, on);

  if (outcome === "missing") return NextResponse.json({ error: "Это желание уже убрали из списка" }, { status: 404 });
  if (outcome === "own") return NextResponse.json({ error: "Это ваш собственный список" }, { status: 400 });
  if (outcome === "taken") {
    const fresh = await wishlistByCode(code);
    return NextResponse.json(
      { error: "Подарок уже забронировал кто-то другой", wishlist: fresh ? friendView(fresh, user.id) : undefined },
      { status: 409, headers: noStore },
    );
  }

  if (outcome === "reserved" && item) {
    await noteReservation(user.id, {
      code,
      itemId: item.id,
      title: item.title,
      image: item.image,
      url: item.url,
      price: item.price,
      currency: item.currency,
      ownerName: list.ownerName,
      at: new Date().toISOString(),
    });
  } else {
    await forgetReservation(user.id, code, body.itemId);
  }

  const fresh = await wishlistByCode(code);
  return NextResponse.json(
    { ok: true, reserved: outcome === "reserved", wishlist: fresh ? friendView(fresh, user.id) : undefined },
    { headers: noStore },
  );
}
