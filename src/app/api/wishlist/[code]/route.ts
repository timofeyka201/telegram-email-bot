import { NextResponse } from "next/server";
import { clientKey, currentUser } from "@/lib/auth/session";
import { friendView, noteMiss, tooManyMisses, wishlistByCode } from "@/lib/wish/server";
import { normalizeCode } from "@/lib/wish/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
type Params = { params: Promise<{ code: string }> };

/**
 * Чужой список по коду. Вход не нужен: ссылку присылают в мессенджере, и
 * требовать регистрацию, чтобы просто посмотреть, — верный способ её не
 * открыть. Для брони вход уже понадобится: без имени сюрприз не поделить.
 */
export async function GET(req: Request, { params }: Params) {
  const { code: raw } = await params;
  const code = normalizeCode(raw);
  const who = clientKey(req);

  if (!code) return NextResponse.json({ error: "Такого кода не бывает" }, { status: 400, headers: noStore });
  if (tooManyMisses(who)) {
    return NextResponse.json({ error: "Слишком много попыток. Попробуйте через несколько минут" }, { status: 429 });
  }

  const list = await wishlistByCode(code);
  if (!list) {
    noteMiss(who);
    return NextResponse.json({ error: "Списка с таким кодом нет" }, { status: 404, headers: noStore });
  }

  const user = await currentUser();
  if (list.ownerId === user?.id) {
    return NextResponse.json({ mine: true, code: list.code }, { headers: noStore });
  }
  if (!list.shared) {
    return NextResponse.json({ error: "Владелец закрыл доступ к этому списку" }, { status: 403, headers: noStore });
  }

  return NextResponse.json({ wishlist: friendView(list, user?.id ?? null) }, { headers: noStore });
}
