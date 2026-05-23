/**
 * Generate the FibroScan report .docx from parsed + physician-edited fields.
 *
 * Layout mirrors the source PDF template (Patient Information / Findings /
 * Interpretation / Conclusion / Recommendations / Sign-off) so the output
 * matches what reading physicians are already used to seeing.
 */

import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import type { PatientRow } from "./db";
import { gradeSteatosis, stageFibrosis, type Etiology } from "./grading";

export function mergedView(row: PatientRow): Record<string, any> {
  return { ...row.parsed, ...(row.edited ?? {}) };
}

function bold(t: string) { return new TextRun({ text: t, bold: true }); }
function plain(t: string) { return new TextRun({ text: t }); }

function field(label: string, value: string | number | null | undefined): Paragraph {
  const display = value == null || value === "" ? "______" : String(value);
  return new Paragraph({
    children: [bold(`${label} `), plain(display)],
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
  const lsm = v.lsm != null ? Number(v.lsm) : null;
  const cap = v.capScore != null ? Number(v.capScore) : null;
  const fib = stageFibrosis(lsm, etiology);
  const ste = gradeSteatosis(cap, etiology);

  const lsmStr     = lsm  != null ? `${lsm} kPa`  : "______";
  const iqrStr     = v.iqr != null ? `${v.iqr} kPa` : "______";
  const ratioStr   = v.iqrMedRatio != null ? `${v.iqrMedRatio}%` : "______";
  const capStr     = cap != null ? `${cap} dB/m${v.capSd != null ? ` (SD ${v.capSd})` : ""}` : "______";
  const successStr = v.successRate != null ? `${v.successRate}%` : "______";

  const fibrosisLine = v.fibrosisStageOverride
    ? `${v.fibrosisStageOverride} (physician-confirmed)`
    : etiology === "Mixed/Unknown"
      ? fib.perEtiology.map((p: any) => `${p.stage} (${p.etiology})`).join(", ")
      : `${fib.summaryStage} (${etiology})`;

  const steatosisLine = v.steatosisGradeOverride
    ? `${v.steatosisGradeOverride} (physician-confirmed)`
    : ste.label;

  const patientCode = v.patientCode ?? "______";
  const signedDate  = new Date().toLocaleString("en-US");

  const doc = new Document({
    creator: "FibroScan Reviewer",
    title: `FibroScan Report ${row.patient_name}`,
    sections: [{
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
        field("Indication for Exam:", row.indication || null),
        heading("Findings"),
        field("Number of Valid Measurements:", v.validMeasurements),
        field("Success Rate:", successStr),
        field("Liver Stiffness Measurement (LSM):", lsmStr),
        field("Interquartile Range (IQR):", iqrStr),
        field("IQR/Median Ratio:", ratioStr),
        field("CAP Score (Controlled Attenuation Parameter):", capStr),
        heading("Interpretation"),
        field("Fibrosis Stage (Based on LSM):", fibrosisLine),
        field("Steatosis Grade (Based on CAP):", steatosisLine),
        field("Additional Notes:", row.additional_notes || null),
        heading("Conclusion"),
        new Paragraph({
          children: [plain(v.clinicalSummary || "______")],
          spacing: { after: 120 },
        }),
        heading("Recommendations"),
        new Paragraph({
          children: [plain(row.recommendations || "______")],
          spacing: { after: 200 },
        }),
        heading("Electronically Signed and Verified"),
        field("Interpreting Physician:", v.interpretingPhysician),
        field("Date:", signedDate),
      ],
    }],
  });

  return await Packer.toBuffer(doc);
}
