/**
 * FibroScan 530 Compact PDF parser (TypeScript port of the original Python parser).
 *
 * Strategy: pdf-parse extracts the text layer; we apply targeted regexes for
 * each field. The text layout from the FibroScan PDF is highly irregular -
 * patient demographics and CAP MEAN/SD are concatenated without separators.
 * The regexes are tuned to that specific layout and validated against the
 * supplied sample report.
 */

// pdf-parse has no first-class types; the package exports a default function.
// eslint-disable-next-line @typescript-eslint/no-var-requires
import pdfParse from "pdf-parse";
import {
  Etiology,
  buildClinicalSummary,
  gradeSteatosis,
  lsmReliability,
  stageFibrosis,
} from "./grading";

export interface ParsedFibroScan {
  // Patient
  patientName: string | null;
  patientCode: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  height: string | null;
  weight: string | null;
  // Exam
  dateOfExam: string | null;
  examTime: string | null;
  operatorId: string | null;
  referringPhysician: string | null;
  interpretingPhysician: string | null;
  probe: string | null;
  // Measurements (raw)
  lsm: number | null;             // E median, kPa
  iqrMedRatio: number | null;     // %
  iqr: number | null;             // kPa (derived: LSM * ratio / 100)
  capScore: number | null;        // dB/m, MEAN
  capSd: number | null;
  sws: string | null;             // m/s
  capLevel: string | null;        // quality indicator
  validMeasurements: number | null;
  successRate: number | null;     // %
  // Derived
  fibrosisStageSummary: string;
  fibrosisPerEtiology: { etiology: string; stage: string }[];
  steatosisGrade: string;
  steatosisLabel: string;
  steatosisThresholdSet: string;
  ruleInSteatosis: boolean;
  ruleInFibrosis: boolean;
  ruleOutFibrosis: boolean;
  reliabilityNote: string;
  clinicalSummary: string;
}

/**
 * Split glued CAP MEAN+SD digits (e.g. "22614" -> mean 226, sd 14).
 * FibroScan 530 PDFs omit spaces between MEAN and SD.
 */
function splitConcatenatedCapSd(blob: string): { mean: number | null; sd: number | null } {
  const digits = blob.replace(/\D/g, "");
  if (!digits) return { mean: null, sd: null };
  if (digits.length === 3) return { mean: parseInt(digits, 10), sd: null };

  const candidates: Array<{ preferThree: boolean; mean: number; sd: number }> = [];
  for (const cut of [3, 4]) {
    if (cut < digits.length) {
      const mean = parseInt(digits.slice(0, cut), 10);
      const sdStr = digits.slice(cut);
      if (!sdStr) continue;
      const sd = parseInt(sdStr, 10);
      if (mean >= 100 && mean <= 400 && sd >= 0 && sd <= 200) {
        candidates.push({ preferThree: cut === 3, mean, sd });
      }
    }
  }
  if (candidates.length) {
    candidates.sort((a, b) => (a.preferThree === b.preferThree ? a.mean - b.mean : a.preferThree ? -1 : 1));
    const c = candidates[0];
    return { mean: c.mean, sd: c.sd };
  }
  const fallback = parseInt(digits, 10);
  return { mean: Number.isFinite(fallback) ? fallback : null, sd: null };
}

function matchFirst(re: RegExp, text: string): RegExpMatchArray | null {
  return text.match(re);
}

export async function parseFibroScanPdf(
  buf: Buffer,
  etiology: Etiology = "Mixed/Unknown",
): Promise<ParsedFibroScan> {
  const { text } = await pdfParse(buf);

  // ---- Patient demographic header --------------------------------------
  // Layout: "5-10 ft-in769816/25/1999MSaranshRAKSHAK"
  const demo = matchFirst(
    /(?:ft-in|in|cm)\s*(\d{3,7})\s*(\d{1,2}\/\d{1,2}\/\d{4})\s*([MF])\s*([A-Z][a-z][a-z\-']*)\s*([A-Z][A-Z\-']{1,})/,
    text,
  );
  const patientCode = demo?.[1] ?? null;
  const dateOfBirth = demo?.[2] ?? null;
  const gender = demo?.[3] ?? null;
  const patientName = demo ? `${demo[4]} ${demo[5]}` : null;

  // Height: "5-10 ft-in" or "175.0 cm"
  const ht = matchFirst(/(\d[\d\-\.]+)\s*(ft-in|ft|cm|in)\b/, text);
  const height = ht ? `${ht[1]} ${ht[2]}` : null;

  // Weight: "155.0 lb" or "70.5 kg"
  const wt = matchFirst(/(\d+(?:\.\d+)?)\s*(lb|kg)\b/, text);
  const weight = wt ? `${wt[1]} ${wt[2]}` : null;

  // Exam date / time
  const exam = matchFirst(/(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}:\d{2}:\d{2}\s*[AP]M)/, text);
  const dateOfExam = exam?.[1] ?? null;
  const examTime = exam?.[2]?.trim() ?? null;

  // Operator surname: "10PatelLiver (50Hz)M"
  const op = matchFirst(/(\d{1,3})([A-Z][a-z]+)Liver/, text);
  let referringPhysician = op ? `DR ${op[2].toUpperCase()}` : null;
  const operatorId = op?.[1] ?? null;

  // Physician block — prefer full name from "Physician:" section.
  const phyBlock = text.match(/Physician:[\s\S]*?\n\s*((?:DR\.?\s+)?[A-Z][A-Z\s\.\-']{2,50})\s*$/m);
  if (phyBlock && phyBlock[1]) {
    const cleaned = phyBlock[1].replace(/\s+/g, " ").trim();
    if (cleaned.length > 3) referringPhysician = cleaned;
  }
  const interpretingPhysician = referringPhysician;

  // Probe
  const probeM = matchFirst(/Liver\s*\(50Hz\)\s*([MXLS\+]+)/, text);
  const probe = probeM?.[1] ?? null;

  // LSM (E median, kPa)
  const lsmM = matchFirst(/(\d+(?:\.\d+)?)\s*E\s*\(kPa\)/, text);
  const lsm = lsmM ? parseFloat(lsmM[1]) : null;

  // IQR/Median ratio (%) — try SWS: pattern, fall back to CAP-LEVEL: pattern
  let iqrMedRatio: number | null = null;
  let m = matchFirst(/SWS:\s*%\s*(\d{1,3})/, text);
  if (m) iqrMedRatio = parseInt(m[1], 10);
  else {
    m = matchFirst(/CAP-LEVEL:[\s\S]{0,80}?%\s*(\d{1,3})/, text);
    if (m) iqrMedRatio = parseInt(m[1], 10);
  }

  const iqr = lsm != null && iqrMedRatio != null ? Math.round(lsm * iqrMedRatio) / 100 : null;

  // CAP score MEAN + SD
  const capRaw = matchFirst(/([\d\s]+?)CAP\s*\(dB\/m\)/, text);
  let capScore: number | null = null;
  let capSd: number | null = null;
  if (capRaw) {
    const { mean, sd } = splitConcatenatedCapSd(capRaw[1]);
    capScore = mean;
    capSd = sd;
  }

  // SWS (m/s)
  const swsM = matchFirst(/(\d+(?:\.\d+)?)\s*m\/s/, text);
  const sws = swsM ? `${swsM[1]} m/s` : null;

  // CAP-LEVEL quality indicator
  const capLvl = matchFirst(/(>?\s*\d+\s*%)\s*\n?\s*SWS:/, text);
  const capLevel = capLvl ? capLvl[1].replace(/\s+/g, " ").trim() : null;

  // Valid measurements - look for trailing index 1..40 after a kPa line
  const indices = Array.from(text.matchAll(/kPa\s*\d+(?:\.\d+)?\s+(\d{1,2})(?=\D|$)/g))
    .map((mt) => parseInt(mt[1], 10))
    .filter((n) => n >= 1 && n <= 40);
  const validMeasurements = indices.length ? Math.max(...indices) : null;

  // Success rate: FibroScan 530 Compact targets 10 acquisitions
  const successRate =
    validMeasurements != null ? Math.min(100, Math.round((validMeasurements / 10) * 100)) : null;

  // Derived medical interpretation
  const fib = stageFibrosis(lsm, etiology);
  const ste = gradeSteatosis(capScore, etiology);
  const rel = lsmReliability(lsm, iqrMedRatio);
  const summary = buildClinicalSummary({
    lsm, iqrMedRatio, cap: capScore, etiology, fibrosis: fib, steatosis: ste,
  });

  return {
    patientName,
    patientCode,
    dateOfBirth,
    gender,
    height,
    weight,
    dateOfExam,
    examTime,
    operatorId,
    referringPhysician,
    interpretingPhysician,
    probe,
    lsm,
    iqrMedRatio,
    iqr,
    capScore,
    capSd,
    sws,
    capLevel,
    validMeasurements,
    successRate,
    fibrosisStageSummary: fib.summaryStage,
    fibrosisPerEtiology: fib.perEtiology,
    steatosisGrade: ste.grade,
    steatosisLabel: ste.label,
    steatosisThresholdSet: ste.thresholdSet,
    ruleInSteatosis: ste.ruleInFlag,
    ruleInFibrosis: fib.ruleInFlag,
    ruleOutFibrosis: fib.ruleOutFlag,
    reliabilityNote: rel.note,
    clinicalSummary: summary,
  };
}
