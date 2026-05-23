/**
 * Steatosis (CAP) and Fibrosis (LSM) grading.
 *
 * Sources used to choose statistically appropriate thresholds:
 * ------------------------------------------------------------
 * CAP / steatosis:
 *   - Karlas et al. (2017) IPD meta-analysis, J Hepatol, n=2735.
 *     Mixed etiologies (HBV 37%, HCV 36%, NAFLD 20%, other 7%).
 *     Best Youden cutoffs: 248 / 268 / 280 dB/m for S>=1 / >=2 / >=3.
 *     PubMed: https://pubmed.ncbi.nlm.nih.gov/28039099/
 *   - Eddowes et al. (2019) Gastroenterology, n=450, biopsy-validated NAFLD.
 *     Cutoffs: 302 / 331 / 337 dB/m.
 *   - M/XL probe IPD meta-analysis (2020): 246/242, 269/267, 285/286 dB/m.
 *   - AASLD 2024 + EASL 2021 quick rule-in for any steatosis: CAP >= 275 dB/m.
 *
 *   The default thresholds used below are the Karlas IPD meta-analysis values
 *   (248 / 268 / 280) because that study has the largest sample (n=2735), the
 *   broadest etiology mix, and is the cutoff set most clinics use for general
 *   FibroScan reporting. For NAFLD/MASLD patients the Eddowes thresholds
 *   (302 / 331 / 337) are made available and the report flags when CAP exceeds
 *   the AASLD/EASL 275 dB/m rule-in threshold.
 *
 * LSM / fibrosis:
 *   - EASL CPG 2021: <8 kPa rules out advanced fibrosis; >=12.5 kPa rules in.
 *   - WHO 2024 HBV: >7 kPa significant fibrosis; >12.5 kPa cirrhosis.
 *   - Castera et al. and EASL for HCV; Nguyen-Khac for ALD.
 *
 * All intervals are half-open [min, max) so every value maps to exactly one bin.
 */

export type SteatosisGrade = "S0" | "S1" | "S2" | "S3" | "Undetermined";
export type FibrosisStage = "F0-F1" | "F2" | "F3" | "F4" | "Undetermined";
export type Etiology =
  | "NAFLD/MASLD"
  | "Hepatitis B"
  | "Hepatitis C"
  | "ALD"
  | "Mixed/Unknown";

// ---- CAP steatosis (default: Karlas 2017) ---------------------------------

export const STEATOSIS_THRESHOLDS_KARLAS = [
  { grade: "S0" as const, label: "S0 - No / minimal steatosis (<11% hepatocytes)", min: 0,   max: 248 },
  { grade: "S1" as const, label: "S1 - Mild steatosis (11-33% hepatocytes)",        min: 248, max: 268 },
  { grade: "S2" as const, label: "S2 - Moderate steatosis (34-66% hepatocytes)",    min: 268, max: 280 },
  { grade: "S3" as const, label: "S3 - Severe steatosis (>66% hepatocytes)",        min: 280, max: Infinity },
];

// NAFLD/MASLD-specific (Eddowes 2019, biopsy-validated)
export const STEATOSIS_THRESHOLDS_EDDOWES = [
  { grade: "S0" as const, label: "S0 - No / minimal steatosis (<5% hepatocytes)",  min: 0,   max: 302 },
  { grade: "S1" as const, label: "S1 - Mild steatosis (5-33% hepatocytes)",         min: 302, max: 331 },
  { grade: "S2" as const, label: "S2 - Moderate steatosis (34-66% hepatocytes)",    min: 331, max: 337 },
  { grade: "S3" as const, label: "S3 - Severe steatosis (>66% hepatocytes)",        min: 337, max: Infinity },
];

export const STEATOSIS_RULE_IN_AASLD_EASL = 275; // dB/m, any steatosis (>=S1)

export interface SteatosisResult {
  grade: SteatosisGrade;
  label: string;
  ruleInFlag: boolean;        // true if CAP >= 275 dB/m
  thresholdSet: "Karlas" | "Eddowes";
}

export function gradeSteatosis(
  cap: number | string | null | undefined,
  etiology: Etiology = "Mixed/Unknown",
): SteatosisResult {
  const c = typeof cap === "string" ? parseFloat(cap) : cap;
  if (c == null || !Number.isFinite(c)) {
    return { grade: "Undetermined", label: "Undetermined (no valid CAP value)", ruleInFlag: false, thresholdSet: "Karlas" };
  }
  const thresholds =
    etiology === "NAFLD/MASLD" ? STEATOSIS_THRESHOLDS_EDDOWES : STEATOSIS_THRESHOLDS_KARLAS;
  const thresholdSet = etiology === "NAFLD/MASLD" ? "Eddowes" : "Karlas";

  for (const b of thresholds) {
    if (c >= b.min && c < b.max) {
      return {
        grade: b.grade,
        label: b.label,
        ruleInFlag: c >= STEATOSIS_RULE_IN_AASLD_EASL,
        thresholdSet,
      };
    }
  }
  return { grade: "Undetermined", label: "Undetermined", ruleInFlag: false, thresholdSet };
}

// ---- LSM fibrosis ---------------------------------------------------------

export const FIBROSIS_THRESHOLDS: Record<
  Exclude<Etiology, "Mixed/Unknown">,
  { stage: FibrosisStage; min: number; max: number }[]
> = {
  "NAFLD/MASLD": [
    { stage: "F0-F1", min: 0,    max: 7.0 },
    { stage: "F2",    min: 7.0,  max: 8.7 },
    { stage: "F3",    min: 8.7,  max: 10.3 },
    { stage: "F4",    min: 10.3, max: Infinity },
  ],
  "Hepatitis C": [
    { stage: "F0-F1", min: 0,    max: 7.1 },
    { stage: "F2",    min: 7.1,  max: 9.5 },
    { stage: "F3",    min: 9.5,  max: 12.5 },
    { stage: "F4",    min: 12.5, max: Infinity },
  ],
  "Hepatitis B": [
    { stage: "F0-F1", min: 0,    max: 7.0 },
    { stage: "F2",    min: 7.0,  max: 8.1 },
    { stage: "F3",    min: 8.1,  max: 11.0 },
    { stage: "F4",    min: 11.0, max: Infinity },
  ],
  "ALD": [
    { stage: "F0-F1", min: 0,    max: 7.5 },
    { stage: "F2",    min: 7.5,  max: 9.5 },
    { stage: "F3",    min: 9.5,  max: 12.5 },
    { stage: "F4",    min: 12.5, max: Infinity },
  ],
};

export const FIBROSIS_RULE_OUT_KPA = 8.0;   // EASL 2021: <8 kPa rules out advanced fibrosis
export const FIBROSIS_RULE_IN_KPA  = 12.5;  // EASL 2021: >=12.5 kPa rules in advanced fibrosis

export interface FibrosisStageResult {
  perEtiology: { etiology: string; stage: FibrosisStage }[];
  summaryStage: FibrosisStage; // single stage for "Mixed/Unknown" (worst across etiologies) or the selected etiology
  ruleInFlag: boolean;
  ruleOutFlag: boolean;
}

const RANK: Record<FibrosisStage, number> = {
  "Undetermined": -1,
  "F0-F1": 0,
  "F2": 1,
  "F3": 2,
  "F4": 3,
};

export function stageFibrosis(
  lsm: number | string | null | undefined,
  etiology: Etiology = "Mixed/Unknown",
): FibrosisStageResult {
  const v = typeof lsm === "string" ? parseFloat(lsm) : lsm;
  if (v == null || !Number.isFinite(v)) {
    return { perEtiology: [], summaryStage: "Undetermined", ruleInFlag: false, ruleOutFlag: false };
  }

  const perEtiology = (Object.keys(FIBROSIS_THRESHOLDS) as Array<keyof typeof FIBROSIS_THRESHOLDS>).map(et => {
    const bin = FIBROSIS_THRESHOLDS[et].find(b => v >= b.min && v < b.max);
    return { etiology: et, stage: (bin?.stage ?? "Undetermined") as FibrosisStage };
  });

  let summary: FibrosisStage = "Undetermined";
  if (etiology !== "Mixed/Unknown") {
    summary = perEtiology.find(p => p.etiology === etiology)?.stage ?? "Undetermined";
  } else {
    // Worst-case across etiologies (most conservative).
    summary = perEtiology.reduce<FibrosisStage>((acc, p) => (RANK[p.stage] > RANK[acc] ? p.stage : acc), "Undetermined");
  }

  return {
    perEtiology,
    summaryStage: summary,
    ruleInFlag:  v >= FIBROSIS_RULE_IN_KPA,
    ruleOutFlag: v <  FIBROSIS_RULE_OUT_KPA,
  };
}

// ---- Reliability ----------------------------------------------------------

/** EASL/AGA: LSM is reliable when IQR/Median <= 30% (<=20% if LSM<7.1 kPa). */
export function lsmReliability(lsm: number | null | undefined, iqrMedRatio: number | null | undefined): {
  reliable: boolean;
  note: string;
} {
  if (lsm == null || iqrMedRatio == null || !Number.isFinite(lsm) || !Number.isFinite(iqrMedRatio)) {
    return { reliable: false, note: "Reliability unknown - missing LSM or IQR/Med ratio." };
  }
  const ratio = iqrMedRatio;
  if (lsm < 7.1) {
    return ratio <= 20
      ? { reliable: true, note: "Reliable measurement (LSM < 7.1 kPa and IQR/Med <= 20%)." }
      : { reliable: false, note: "Less reliable: LSM < 7.1 kPa requires IQR/Med <= 20%." };
  }
  return ratio <= 30
    ? { reliable: true, note: "Reliable measurement (IQR/Med <= 30%)." }
    : { reliable: false, note: "Less reliable: IQR/Med > 30% suggests caution interpreting LSM." };
}

// ---- Auto-narrative -------------------------------------------------------

export function buildClinicalSummary(args: {
  lsm: number | null;
  iqrMedRatio: number | null;
  cap: number | null;
  etiology: Etiology;
  fibrosis: FibrosisStageResult;
  steatosis: SteatosisResult;
}): string {
  const parts: string[] = [];
  if (args.lsm != null) {
    const rel = lsmReliability(args.lsm, args.iqrMedRatio);
    let note = "";
    if (args.fibrosis.ruleOutFlag) note = " EASL 2021: LSM <8 kPa - advanced fibrosis unlikely.";
    else if (args.fibrosis.ruleInFlag) note = " EASL 2021: LSM >=12.5 kPa - advanced fibrosis likely.";
    parts.push(`LSM ${args.lsm} kPa - ${rel.note}${note} Fibrosis stage: ${args.fibrosis.summaryStage} (${args.etiology}).`);
  }
  if (args.cap != null) {
    const cap = args.cap;
    const flag = cap >= STEATOSIS_RULE_IN_AASLD_EASL
      ? ` AASLD 2024 / EASL 2021: CAP >=275 dB/m - any steatosis likely.`
      : "";
    parts.push(`CAP ${cap} dB/m - ${args.steatosis.label}.${flag} Thresholds applied: ${args.steatosis.thresholdSet}.`);
  }
  return parts.join("  ");
}
