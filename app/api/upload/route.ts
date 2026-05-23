import { NextRequest, NextResponse } from "next/server";
import { parseFibroScanPdf } from "@/lib/parser";
import { createPatient } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No PDF uploaded (expected field 'file')." }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "File must be a .pdf" }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const parsed = await parseFibroScanPdf(buf);

    if (!parsed.patientName) {
      return NextResponse.json(
        { error: "Could not extract patient name from PDF. Is this a FibroScan 530 Compact report?" },
        { status: 422 },
      );
    }

    const row = await createPatient({
      patient_name: parsed.patientName,
      patient_code: parsed.patientCode,
      date_of_exam: parsed.dateOfExam,
      parsed,
      pdf_blob_url: null,
    });

    return NextResponse.json({ ok: true, id: row.id, patient: row });
  } catch (e: any) {
    console.error("upload failed:", e);
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
