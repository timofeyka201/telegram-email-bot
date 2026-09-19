import { NextResponse } from "next/server";
import { currentUser, toPublic } from "@/lib/auth/session";
import { storageWarning } from "@/lib/auth/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  return NextResponse.json(
    { user: user ? toPublic(user) : null, warning: storageWarning() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
