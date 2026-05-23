/**
 * POST /api/upload  -- multipart/form-data with field "file" (PDF).
 *
 * Flow:
 *   1. Parse the FibroScan PDF in memory (pdf-parse).
 *   2. Upload the PDF to Vercel Blob storage for archival / re-parsing.
 *   3. Insert a new patient row in Postgres with the parsed payload.
 *   4. Return the created row so the UI can navigate to it.
 */

import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
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

    // Upload PDF to Blob (optional but useful for re-parsing/audit).
    let pdfUrl: string | null = null;
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "_");
      const upload = await put(`pdfs/${Date.now()}_${safeName}`, buf, {
        access: "public",
        contentType: "application/pdf",
      });
      pdfUrl = upload.url;
    }

    const row = await createPatient({
      patient_name: parsed.patientName,
      patient_code: parsed.patientCode,
      date_of_exam: parsed.dateOfExam,
      parsed,
      pdf_blob_url: pdfUrl,
    });

    return NextResponse.json({ ok: true, id: row.id, patient: row });
  } catch (e: any) {
    console.error("upload failed:", e);
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
