/**
 * POST /api/rag
 *
 * Body: { patientId, fibrosis, steatosis, etiology, lsm, cap, currentRecommendations }
 * Returns: { suggestion: string }
 *
 * Retrieves similar past recommendations from recommendation_history,
 * then asks Claude to synthesize a suggestion for the current patient.
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { similarRecommendations } from "@/lib/db";

export const runtime = "nodejs";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      fibrosis,
      steatosis,
      etiology,
      lsm,
      cap,
      currentRecommendations,
    } = body;

    const history = await similarRecommendations({ fibrosis, steatosis, etiology, limit: 8 });

    const historyBlock =
      history.length > 0
        ? history
            .map(
              (h, i) =>
                `Example ${i + 1} (${h.etiology ?? "Unknown etiology"}, ${h.fibrosis ?? "?"}, ${h.steatosis ?? "?"}):\n${h.text}`
            )
            .join("\n\n")
        : "No prior recommendations available for similar patients.";

    const prompt = `You are a hepatology clinical assistant helping a physician draft FibroScan report recommendations.

Current patient findings:
- Etiology: ${etiology ?? "Mixed/Unknown"}
- LSM: ${lsm ?? "N/A"} kPa
- Fibrosis stage: ${fibrosis ?? "N/A"}
- CAP: ${cap ?? "N/A"} dB/m
- Steatosis grade: ${steatosis ?? "N/A"}
${currentRecommendations?.trim() ? `\nPhysician's current draft recommendations:\n${currentRecommendations}` : ""}

Prior recommendations written for similar patients (fibrosis stage / etiology match):
${historyBlock}

Based on the clinical findings and the examples above, write a concise, clinically appropriate recommendation paragraph for this patient. Focus on follow-up interval, lifestyle counseling, and any indicated referrals. Do not invent lab values or imaging not mentioned. Write in professional medical prose, 2-4 sentences.`;

    const stream = anthropic.messages.stream({
      model: "claude-opus-4-8",
      max_tokens: 512,
      thinking: { type: "adaptive" },
      messages: [{ role: "user", content: prompt }],
    });

    const message = await stream.finalMessage();
    const suggestion = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as any).text)
      .join("")
      .trim();

    return NextResponse.json({ ok: true, suggestion });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
