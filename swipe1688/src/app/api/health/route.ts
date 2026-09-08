import { NextResponse } from "next/server";
import { hasToken } from "@/lib/bhapi";
import { defaultProvider, providerInfo } from "@/lib/providers";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    tokenConfigured: hasToken(),
    providers: providerInfo(),
    defaultProvider: defaultProvider().id,
  });
}
