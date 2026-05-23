import { NextResponse } from "next/server";
import { listPatients } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const rows = await listPatients();
    return NextResponse.json({ ok: true, patients: rows });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
