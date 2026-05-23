/**
 * Generate the FibroScan report .docx from parsed + physician-edited fields.
 *
 * Layout mirrors the source PDF template (Patient Information / Findings /
 * Interpretation / Conclusion / Recommendations / Sign-off) so the output
 * matches what reading physicians are already used to seeing.
 */

import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import type { PatientRow } from "./db";
import { gradeSteatosis, stageFibrosis, type Etiology } from "./grading";

/**
 * Merge raw-parsed values with physician edits. Edits win.
 */
export function mergedView(row: PatientRow): Record<string, any> {
  return { ...row.parsed, ...(row.edited ?? {}) };
}

function bold(t: string) {
  return new TextRun({ text: t, bold: true });
}
function plain(t: string) {
  return new TextRun({ text: t });
}
function field(label: string, value: string | number | null | undefined): Paragraph {
  return new Paragraph({
    children: [bold(`${label} `), plain(value == null || value === "" ? "______" : String(value))],
    spacing: { after: 80 },
  });
}
function heading(text: string): Paragraph {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 200, after: 100 },
  });
}

export async function buildReportDocx(row: PatientRow): Promise<Buffer> {
  const v = mergedView(row);
  const etiology = (v.etiology as Etiology) || "Mixed/Unknown";

  // Recompute derived values from the merged data so manual edits to CAP/LSM
  // re-grade automatically before generation.
  const lsm = v.lsm != null ? Number(v.lsm) : null;
  const cap = v.capScore != null ? Number(v.capScore) : null;
  const fib = stageFibrosis(lsm, etiology);
  const ste = gradeSteatosis(cap, etiology);

  const successRateStr = v.successRate != null ? `${v.successRate}%` : "______";
  const iqrStr = v.iqr != null ? `${v.iqr} kPa` : "______";
  const ratioStr = v.iqrMedRatio != null ? `${v.iqrMedRatio}%` : "______";
  const lsmStr = v.lsm != null ? `${v.lsm} kPa` : "______";
  const capStr = v.capScore != null ? `${v.capScore} dB/m${v.capSd != null ? ` (SD ${v.capSd})` : ""}` : "______";

  const examDate = v.dateOfExam ?? "______";
  const patientCode = v.patientCode ?? "______";
  const signedDate = new Date().toLocaleString("en-US");

  const fibrosisLine =
    v.fibrosisStageOverride
      ? `${v.fibrosisStageOverride} (physician-confirmed)`
      : etiology === "Mixed/Unknown"
        ? fib.perEtiology
            .map((p) => `${p.stage} (${p.etiology})`)
            .join(", ")
        : `${fib.summaryStage} (${etiology})`;

  const steatosisLine =
    v.steatosisGradeOverride
      ? `${v.steatosisGradeOverride} (physician-confirmed)`
      : ste.label;

  const doc = new Document({
    creator: "FibroScan Reviewer",
    title: `FibroScan Report ${row.patient_name}`,
    sections: [
      {
        children: [
          new Paragraph({
            children: [bold(`FibroScan Report (Code: ${patientCode})`)],
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.LEFT,
            spacing: { after: 200 },
          }),

          heading("Patient Information"),
          field("Name:", v.patientName),
          field("Date of Birth:", v.dateOfBirth),
          field("Patient ID:", v.patientCode),
          field("Date of Exam:", v.dateOfExam),
          field("Referring Physician:", v.referringPhysician),
          field("Indication for Exam:", row.indication || ""),

          heading("Findings"),
          field("Number of Valid Measurements:", v.validMeasurements),
          field("Success Rate:", successRateStr),
          field("Liver Stiffness Measurement (LSM):", lsmStr),
          field("Interquartile Range (IQR):", iqrStr),
          field("IQR/Median Ratio:", ratioStr),
          field("CAP Score (Controlled Attenuation Parameter):", capStr),
          field("Probe:", v.probe),
          field("Shear Wave Speed:", v.sws),
          field("CAP Quality Indicator:", v.capLevel),

          heading("Interpretation"),
          field("Etiology Context:", etiology),
          field("Fibrosis Stage (Based on LSM):", fibrosisLine),
          field("Steatosis Grade (Based on CAP):", steatosisLine),
          field("Steatosis Threshold Set Used:", ste.thresholdSet),
          field("Reliability:", v.reliabilityNote),
          field("Additional Notes:", row.additional_notes || ""),

          heading("Conclusion"),
          new Paragraph({
            children: [plain(v.clinicalSummary || "")],
            spacing: { after: 120 },
          }),

          heading("Recommendations"),
          new Paragraph({
            children: [plain(row.recommendations || "No follow-up required.")],
            spacing: { after: 200 },
          }),

          heading("Electronically Signed and Verified"),
          field("Interpreting Physician:", v.interpretingPhysician),
          field("Date:", signedDate),
          field("Status:", row.status === "completed" ? "COMPLETED" : "IN PROGRESS"),
        ],
      },
    ],
  });

  return await Packer.toBuffer(doc);
}
