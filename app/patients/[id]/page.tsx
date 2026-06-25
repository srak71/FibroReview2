"use client";

/**
 * Per-patient report editor:
 *   - Shows parsed values; physician can edit any field.
 *   - Override fibrosis / steatosis grade if needed (numeric values auto-re-grade).
 *   - Recommendations textarea is the primary physician input.
 *   - Save persists edits to Postgres -> all viewers see updates.
 *   - Status toggle: In Progress (orange) <-> Completed (green).
 *   - Download .docx generates the final report from current saved state.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

interface PatientRow {
  id: string;
  patient_name: string;
  patient_code: string | null;
  date_of_exam: string | null;
  parsed: any;
  edited: Record<string, any>;
  recommendations: string;
  indication: string;
  additional_notes: string;
  status: "in_progress" | "completed";
  pdf_blob_url: string | null;
  updated_at: string;
}

const ETIOLOGIES = ["Mixed/Unknown", "NAFLD/MASLD", "Hepatitis B", "Hepatitis C", "ALD"] as const;
const FIBROSIS_STAGES = ["F0-F1", "F2", "F3", "F4"] as const;
const STEATOSIS_GRADES = ["S0", "S1", "S2", "S3"] as const;

export default function PatientPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const [row, setRow] = useState<PatientRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Local editable form state
  const [form, setForm] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/patients/${id}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed to load");
      setRow(j.patient);
      setForm({
        ...j.patient.parsed,
        ...j.patient.edited,
        etiology: j.patient.edited?.etiology ?? "Mixed/Unknown",
        recommendations: j.patient.recommendations ?? "",
        indication: j.patient.indication ?? "",
        additional_notes: j.patient.additional_notes ?? "",
        status: j.patient.status,
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const update = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const handleAiSuggest = async () => {
    if (!form) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const r = await fetch("/api/rag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: id,
          fibrosis: form.fibrosisStageOverride ?? form.fibrosisStageSummary ?? null,
          steatosis: form.steatosisGradeOverride ?? form.steatosisGrade ?? null,
          etiology: form.etiology ?? null,
          lsm: form.lsm ?? null,
          cap: form.capScore ?? null,
          currentRecommendations: form.recommendations ?? "",
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "AI suggestion failed");
      update("recommendations", j.suggestion);
    } catch (e: any) {
      setAiError(e.message);
    } finally {
      setAiLoading(false);
    }
  };

  const handleSave = async (markCompleted?: boolean) => {
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      const {
        recommendations,
        indication,
        additional_notes,
        status,
        ...edited
      } = form;

      const r = await fetch(`/api/patients/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          edited,
          recommendations,
          indication,
          additional_notes,
          status: markCompleted ? "completed" : status,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Save failed");
      setRow(j.patient);
      setForm({
        ...j.patient.parsed,
        ...j.patient.edited,
        recommendations: j.patient.recommendations,
        indication: j.patient.indication,
        additional_notes: j.patient.additional_notes,
        status: j.patient.status,
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this patient report? This cannot be undone.")) return;
    await fetch(`/api/patients/${id}`, { method: "DELETE" });
    router.push("/");
  };

  if (loading || !row || !form) {
    return <div className="text-slate-500">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href="/" className="text-sm text-blue-600 hover:underline">&larr; Back to all patients</Link>
          <h1 className="text-2xl font-semibold mt-1">{row.patient_name}</h1>
          <div className="text-sm text-slate-600">
            ID {row.patient_code ?? "?"} &middot; Exam {row.date_of_exam ?? "?"}
            {row.pdf_blob_url && (
              <>
                {" "}&middot;{" "}
                <a className="text-blue-600 hover:underline" href={row.pdf_blob_url} target="_blank" rel="noreferrer">
                  Original PDF
                </a>
              </>
            )}
          </div>
        </div>
        <StatusPill status={form.status} />
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">{error}</div>
      )}

      <Section title="Patient Information">
        <Field label="Name" value={form.patientName ?? ""} onChange={(v) => update("patientName", v)} />
        <Field label="Date of Birth" value={form.dateOfBirth ?? ""} onChange={(v) => update("dateOfBirth", v)} />
        <Field label="Patient ID" value={form.patientCode ?? ""} onChange={(v) => update("patientCode", v)} />
        <Field label="Date of Exam" value={form.dateOfExam ?? ""} onChange={(v) => update("dateOfExam", v)} />
        <Field label="Gender" value={form.gender ?? ""} onChange={(v) => update("gender", v)} />
        <Field label="Height" value={form.height ?? ""} onChange={(v) => update("height", v)} />
        <Field label="Weight" value={form.weight ?? ""} onChange={(v) => update("weight", v)} />
        <Field label="Referring Physician" value={form.referringPhysician ?? ""} onChange={(v) => update("referringPhysician", v)} />
        <Field label="Interpreting Physician" value={form.interpretingPhysician ?? ""} onChange={(v) => update("interpretingPhysician", v)} />
        <TextArea label="Indication for Exam" value={form.indication} onChange={(v) => update("indication", v)} />
      </Section>

      <Section title="Findings (from PDF — verify and correct if needed)">
        <Field label="LSM (kPa)" value={form.lsm ?? ""} onChange={(v) => update("lsm", v === "" ? null : Number(v))} type="number" step="0.1" />
        <Field label="IQR (kPa)" value={form.iqr ?? ""} onChange={(v) => update("iqr", v === "" ? null : Number(v))} type="number" step="0.1" />
        <Field label="IQR/Median Ratio (%)" value={form.iqrMedRatio ?? ""} onChange={(v) => update("iqrMedRatio", v === "" ? null : Number(v))} type="number" />
        <Field label="CAP (dB/m)" value={form.capScore ?? ""} onChange={(v) => update("capScore", v === "" ? null : Number(v))} type="number" />
        <Field label="CAP SD" value={form.capSd ?? ""} onChange={(v) => update("capSd", v === "" ? null : Number(v))} type="number" />
        <Field label="Valid Measurements" value={form.validMeasurements ?? ""} onChange={(v) => update("validMeasurements", v === "" ? null : Number(v))} type="number" />
        <Field label="Success Rate (%)" value={form.successRate ?? ""} onChange={(v) => update("successRate", v === "" ? null : Number(v))} type="number" />
        <Field label="Probe" value={form.probe ?? ""} onChange={(v) => update("probe", v)} />
        <Field label="Shear Wave Speed" value={form.sws ?? ""} onChange={(v) => update("sws", v)} />
        <Field label="CAP Quality" value={form.capLevel ?? ""} onChange={(v) => update("capLevel", v)} />
      </Section>

      <Section title="Interpretation">
        <SelectField
          label="Etiology Context"
          value={form.etiology}
          onChange={(v) => update("etiology", v)}
          options={ETIOLOGIES as unknown as string[]}
        />
        <ComputedRow form={form} />
        <SelectField
          label="Fibrosis Stage Override (optional)"
          value={form.fibrosisStageOverride ?? ""}
          onChange={(v) => update("fibrosisStageOverride", v || undefined)}
          options={["", ...FIBROSIS_STAGES]}
        />
        <SelectField
          label="Steatosis Grade Override (optional)"
          value={form.steatosisGradeOverride ?? ""}
          onChange={(v) => update("steatosisGradeOverride", v || undefined)}
          options={["", ...STEATOSIS_GRADES]}
        />
        <TextArea label="Additional Notes" value={form.additional_notes} onChange={(v) => update("additional_notes", v)} />
      </Section>

      <Section title="Recommendations (the physician section)">
        <TextArea
          label="Recommendations"
          value={form.recommendations}
          onChange={(v) => update("recommendations", v)}
          rows={6}
          placeholder="e.g. Repeat FibroScan in 12 months. Counsel on weight loss and lifestyle modification..."
        />
        <div className="sm:col-span-2 flex flex-col gap-2">
          <button
            onClick={handleAiSuggest}
            disabled={aiLoading}
            className="self-start text-sm px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-md"
          >
            {aiLoading ? "Generating..." : "Get AI Suggestion"}
          </button>
          {aiError && (
            <p className="text-xs text-red-600">{aiError}</p>
          )}
          <p className="text-xs text-slate-500">
            AI suggests recommendations based on prior reports with similar fibrosis stage and etiology. Review and edit before saving.
          </p>
        </div>
      </Section>

      <div className="sticky bottom-4 bg-white card p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium">Status:</label>
          <select
            value={form.status}
            onChange={(e) => update("status", e.target.value)}
            className="border border-slate-300 rounded-md px-2 py-1 text-sm"
          >
            <option value="in_progress">In Progress (orange)</option>
            <option value="completed">Completed (green)</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDelete}
            className="text-sm px-3 py-2 border border-red-300 text-red-700 hover:bg-red-50 rounded-md"
          >
            Delete
          </button>
          <a
            href={`/api/patients/${id}/report`}
            className="text-sm px-3 py-2 border border-slate-300 hover:bg-slate-50 rounded-md"
          >
            Download .docx
          </a>
          <button
            disabled={saving}
            onClick={() => handleSave(false)}
            className="text-sm px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-md"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            disabled={saving}
            onClick={() => handleSave(true)}
            className="text-sm px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-md"
          >
            Save & Mark Completed
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: "in_progress" | "completed" }) {
  return (
    <span
      className={`text-xs font-medium px-3 py-1 rounded-full ${
        status === "completed" ? "bg-green-600 text-white" : "bg-orange-500 text-white"
      }`}
    >
      {status === "completed" ? "Completed" : "In Progress"}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">{title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  step,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  step?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <input
        type={type}
        step={step}
        value={value as any}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
      />
    </label>
  );
}

function TextArea({
  label, value, onChange, rows = 3, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string;
}) {
  return (
    <label className="block sm:col-span-2">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-sans"
      />
    </label>
  );
}

function SelectField({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white"
      >
        {options.map((o) => (
          <option key={o} value={o}>{o || "(no override - use calculated)"}</option>
        ))}
      </select>
    </label>
  );
}

/**
 * Show the auto-graded fibrosis/steatosis based on current edited values.
 * This recomputes client-side so the user sees an immediate update as they
 * edit LSM/CAP, but the canonical value is recomputed on the server when
 * the .docx is generated.
 */
function ComputedRow({ form }: { form: any }) {
  const computed = useMemo(() => {
    const lsm = form.lsm == null || form.lsm === "" ? null : Number(form.lsm);
    const cap = form.capScore == null || form.capScore === "" ? null : Number(form.capScore);
    const etiology = form.etiology;
    return {
      fibrosis: gradeFibrosisClient(lsm, etiology),
      steatosis: gradeSteatosisClient(cap, etiology),
    };
  }, [form.lsm, form.capScore, form.etiology]);

  return (
    <div className="sm:col-span-2 bg-slate-50 border border-slate-200 rounded-md p-3 text-sm">
      <div><span className="text-slate-500">Auto Fibrosis: </span><strong>{computed.fibrosis}</strong></div>
      <div><span className="text-slate-500">Auto Steatosis: </span><strong>{computed.steatosis}</strong></div>
      <div className="text-xs text-slate-500 mt-1">
        Overrides below take precedence in the final report.
      </div>
    </div>
  );
}

// Client-side mirrors of the server grading logic for instant feedback.
function gradeFibrosisClient(lsm: number | null, etiology: string): string {
  if (lsm == null || !Number.isFinite(lsm)) return "N/A";
  const T: Record<string, { stage: string; min: number; max: number }[]> = {
    "NAFLD/MASLD": [
      { stage: "F0-F1", min: 0, max: 7.0 }, { stage: "F2", min: 7.0, max: 8.7 },
      { stage: "F3", min: 8.7, max: 10.3 }, { stage: "F4", min: 10.3, max: Infinity },
    ],
    "Hepatitis C": [
      { stage: "F0-F1", min: 0, max: 7.1 }, { stage: "F2", min: 7.1, max: 9.5 },
      { stage: "F3", min: 9.5, max: 12.5 }, { stage: "F4", min: 12.5, max: Infinity },
    ],
    "Hepatitis B": [
      { stage: "F0-F1", min: 0, max: 7.0 }, { stage: "F2", min: 7.0, max: 8.1 },
      { stage: "F3", min: 8.1, max: 11.0 }, { stage: "F4", min: 11.0, max: Infinity },
    ],
    "ALD": [
      { stage: "F0-F1", min: 0, max: 7.5 }, { stage: "F2", min: 7.5, max: 9.5 },
      { stage: "F3", min: 9.5, max: 12.5 }, { stage: "F4", min: 12.5, max: Infinity },
    ],
  };
  if (etiology in T) {
    const b = T[etiology].find((x) => lsm >= x.min && lsm < x.max);
    return b ? `${b.stage} (${etiology})` : "N/A";
  }
  return Object.entries(T).map(([k, v]) => {
    const b = v.find((x) => lsm >= x.min && lsm < x.max);
    return b ? `${b.stage} (${k})` : "";
  }).filter(Boolean).join(", ");
}

function gradeSteatosisClient(cap: number | null, etiology: string): string {
  if (cap == null || !Number.isFinite(cap)) return "N/A";
  const karlas = [
    { g: "S0", min: 0, max: 248 }, { g: "S1", min: 248, max: 268 },
    { g: "S2", min: 268, max: 280 }, { g: "S3", min: 280, max: Infinity },
  ];
  const eddowes = [
    { g: "S0", min: 0, max: 302 }, { g: "S1", min: 302, max: 331 },
    { g: "S2", min: 331, max: 337 }, { g: "S3", min: 337, max: Infinity },
  ];
  const set = etiology === "NAFLD/MASLD" ? eddowes : karlas;
  const setName = etiology === "NAFLD/MASLD" ? "Eddowes" : "Karlas";
  const b = set.find((x) => cap >= x.min && cap < x.max);
  return b ? `${b.g} (${setName})${cap >= 275 ? " - >= 275 dB/m rule-in" : ""}` : "N/A";
}
