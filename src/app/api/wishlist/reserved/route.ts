import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/session";
import { myReservations } from "@/lib/wish/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Что я обещал подарить: собственная памятка дарителя. */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Нужен вход" }, { status: 401 });
  return NextResponse.json(
    { reservations: await myReservations(user.id) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
