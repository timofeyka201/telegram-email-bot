import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/session";
import { myWishlist, ownerView, saveWishlist } from "@/lib/wish/server";
import { clip, MAX_NOTE, MAX_TITLE } from "@/lib/wish/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
const needAuth = () => NextResponse.json({ error: "Нужен вход" }, { status: 401 });

/** Мой список — со всем, что в нём есть, но без чужих броней. */
export async function GET() {
  const user = await currentUser();
  if (!user) return needAuth();
  const list = await myWishlist(user);
  return NextResponse.json({ wishlist: ownerView(list) }, { headers: noStore });
}

/** Название, подпись и доступ по ссылке. */
export async function PATCH(req: Request) {
  const user = await currentUser();
  if (!user) return needAuth();

  let body: { title?: string; note?: string; shared?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const list = await myWishlist(user);
  if (typeof body.title === "string") list.title = clip(body.title, MAX_TITLE) || "Мой вишлист";
  if (typeof body.note === "string") list.note = clip(body.note, MAX_NOTE) || undefined;
  if (typeof body.shared === "boolean") list.shared = body.shared;
  await saveWishlist(list);

  return NextResponse.json({ wishlist: ownerView(list) }, { headers: noStore });
}
