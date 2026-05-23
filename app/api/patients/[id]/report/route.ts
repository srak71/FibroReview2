/**
 * GET /api/patients/:id/report  -> downloadable .docx report
 */

import { NextRequest, NextResponse } from "next/server";
import { getPatient } from "@/lib/db";
import { buildReportDocx } from "@/lib/docx";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const row = await getPatient(params.id);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  const buf = await buildReportDocx(row);
  const safe = row.patient_name.replace(/[^A-Za-z0-9._-]+/g, "_");
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="FibroScan_Report_${safe}.docx"`,
      "Cache-Control": "no-store",
    },
  });
}
