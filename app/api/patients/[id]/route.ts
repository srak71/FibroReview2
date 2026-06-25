/**
 * GET    /api/patients/:id   -> fetch one patient
 * PATCH  /api/patients/:id   -> update edits / recommendations / status
 * DELETE /api/patients/:id   -> remove
 */

import { NextRequest, NextResponse } from "next/server";
import { deletePatient, getPatient, ingestRecommendation, updatePatient } from "@/lib/db";

export const runtime = "nodejs";

interface RouteCtx {
  params: { id: string };
}

export async function GET(_req: NextRequest, { params }: RouteCtx) {
  const row = await getPatient(params.id);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, patient: row });
}

export async function PATCH(req: NextRequest, { params }: RouteCtx) {
  try {
    const body = await req.json();
    const row = await updatePatient(params.id, {
      edited: body.edited,
      recommendations: body.recommendations,
      indication: body.indication,
      additional_notes: body.additional_notes,
      status: body.status,
    });
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

    // Ingest recommendations into RAG history whenever non-empty text is saved.
    if (body.recommendations?.trim()) {
      const edited = body.edited ?? {};
      await ingestRecommendation({
        patient_id: params.id,
        text: body.recommendations,
        lsm: edited.lsm ?? null,
        cap: edited.capScore ?? null,
        fibrosis: edited.fibrosisStageSummary ?? edited.fibrosisStageOverride ?? null,
        steatosis: edited.steatosisGrade ?? edited.steatosisGradeOverride ?? null,
        etiology: edited.etiology ?? null,
      }).catch(() => {/* non-critical — don't fail the save */});
    }

    return NextResponse.json({ ok: true, patient: row });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteCtx) {
  await deletePatient(params.id);
  return NextResponse.json({ ok: true });
}
