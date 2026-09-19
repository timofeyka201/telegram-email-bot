import { NextResponse } from "next/server";
import { diagnoseStorage } from "@/lib/auth/store";
import { mailProblem } from "@/lib/auth/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Проверка хранилища учётных записей и почты. Ни адреса, ни ключи наружу
 * не выходят — только вердикт, по которому понятно, что именно чинить.
 */
export async function GET() {
  const storage = await diagnoseStorage();
  const mail = mailProblem();
  return NextResponse.json(
    {
      ...storage,
      mail: mail
        ? { ready: false, detail: `${mail}. Подтверждение почты и смена пароля работать не будут.` }
        : { ready: true, detail: "Ключ почтового сервиса на месте." },
    },
    { status: storage.reachable ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
