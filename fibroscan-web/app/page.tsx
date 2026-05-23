"use client";

/**
 * Home: patient list + PDF upload.
 *
 * Visual rule the user requested: green when a report is "completed",
 * orange when it is "in_progress".
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

interface PatientRow {
  id: string;
  patient_name: string;
  patient_code: string | null;
  date_of_exam: string | null;
  status: "in_progress" | "completed";
  parsed: any;
  edited: any;
  recommendations: string;
  updated_at: string;
}

export default function HomePage() {
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/patients", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed to load");
      setPatients(j.patients);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/upload", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Upload failed");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }, [load]);

  const filtered = patients.filter((p) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      p.patient_name.toLowerCase().includes(q) ||
      (p.patient_code ?? "").toLowerCase().includes(q)
    );
  });

  const inProgress = patients.filter(p => p.status === "in_progress").length;
  const completed  = patients.filter(p => p.status === "completed").length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Patients</h1>
          <p className="text-sm text-slate-600">
            {completed} completed (green) &middot; {inProgress} in progress (orange)
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or ID..."
            className="border border-slate-300 rounded-md px-3 py-2 text-sm w-64"
          />
          <button
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-md"
          >
            {uploading ? "Uploading..." : "Upload PDF"}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
            }}
          />
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-slate-500">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="card p-10 text-center text-slate-600">
          {patients.length === 0
            ? "No patients yet. Upload a FibroScan PDF to get started."
            : "No patients match your search."}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <PatientCard key={p.id} p={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function PatientCard({ p }: { p: PatientRow }) {
  const merged = { ...p.parsed, ...p.edited };
  const isDone = p.status === "completed";
  return (
    <Link
      href={`/patients/${p.id}`}
      className={`card p-4 block hover:shadow transition ${
        isDone ? "status-completed" : "status-in_progress"
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="font-semibold text-slate-900">{p.patient_name}</div>
          <div className="text-xs text-slate-600">
            ID {p.patient_code ?? "?"} &middot; Exam {p.date_of_exam ?? "?"}
          </div>
        </div>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded ${
            isDone ? "bg-green-600 text-white" : "bg-orange-500 text-white"
          }`}
        >
          {isDone ? "Completed" : "In Progress"}
        </span>
      </div>
      <div className="mt-3 text-sm space-y-1">
        <div>
          <span className="text-slate-500">LSM:</span> {merged.lsm ?? "?"} kPa
          {merged.fibrosisStageSummary && (
            <span className="text-slate-500"> &rarr; {merged.fibrosisStageOverride ?? merged.fibrosisStageSummary}</span>
          )}
        </div>
        <div>
          <span className="text-slate-500">CAP:</span> {merged.capScore ?? "?"} dB/m
          {merged.steatosisGrade && (
            <span className="text-slate-500"> &rarr; {merged.steatosisGradeOverride ?? merged.steatosisGrade}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
