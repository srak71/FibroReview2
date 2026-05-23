/**
 * Postgres schema and helpers (Vercel Postgres).
 *
 * Schema:
 *   patients
 *     id              uuid pk
 *     patient_name    text
 *     patient_code    text
 *     date_of_exam    text
 *     parsed          jsonb    -- raw parser output
 *     edited          jsonb    -- physician-modified fields (overrides parsed)
 *     recommendations text
 *     indication      text
 *     additional_notes text
 *     status          text     -- 'in_progress' | 'completed'
 *     pdf_blob_url    text
 *     created_at      timestamptz
 *     updated_at      timestamptz
 *
 * `ensureSchema()` runs idempotently on first API call.
 */

import { sql } from "@vercel/postgres";

let initialised = false;

export async function ensureSchema(): Promise<void> {
  if (initialised) return;
  await sql`
    CREATE TABLE IF NOT EXISTS patients (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_name    text NOT NULL,
      patient_code    text,
      date_of_exam    text,
      parsed          jsonb NOT NULL,
      edited          jsonb NOT NULL DEFAULT '{}'::jsonb,
      recommendations text NOT NULL DEFAULT '',
      indication      text NOT NULL DEFAULT '',
      additional_notes text NOT NULL DEFAULT '',
      status          text NOT NULL DEFAULT 'in_progress',
      pdf_blob_url    text,
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now()
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS patients_status_idx ON patients(status);`;
  await sql`CREATE INDEX IF NOT EXISTS patients_updated_idx ON patients(updated_at DESC);`;
  initialised = true;
}

export interface PatientRow {
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
  created_at: string;
  updated_at: string;
}

export async function listPatients(): Promise<PatientRow[]> {
  await ensureSchema();
  const { rows } = await sql<PatientRow>`
    SELECT * FROM patients ORDER BY updated_at DESC;
  `;
  return rows;
}

export async function getPatient(id: string): Promise<PatientRow | null> {
  await ensureSchema();
  const { rows } = await sql<PatientRow>`SELECT * FROM patients WHERE id = ${id} LIMIT 1;`;
  return rows[0] ?? null;
}

export async function createPatient(args: {
  patient_name: string;
  patient_code: string | null;
  date_of_exam: string | null;
  parsed: any;
  pdf_blob_url: string | null;
}): Promise<PatientRow> {
  await ensureSchema();
  const { rows } = await sql<PatientRow>`
    INSERT INTO patients (patient_name, patient_code, date_of_exam, parsed, pdf_blob_url)
    VALUES (${args.patient_name}, ${args.patient_code}, ${args.date_of_exam},
            ${JSON.stringify(args.parsed)}::jsonb, ${args.pdf_blob_url})
    RETURNING *;
  `;
  return rows[0];
}

export async function updatePatient(id: string, patch: {
  edited?: Record<string, any>;
  recommendations?: string;
  indication?: string;
  additional_notes?: string;
  status?: "in_progress" | "completed";
}): Promise<PatientRow | null> {
  await ensureSchema();
  // Build a single UPDATE - only set provided fields.
  const current = await getPatient(id);
  if (!current) return null;
  const next = {
    edited: patch.edited ?? current.edited,
    recommendations: patch.recommendations ?? current.recommendations,
    indication: patch.indication ?? current.indication,
    additional_notes: patch.additional_notes ?? current.additional_notes,
    status: patch.status ?? current.status,
  };
  const { rows } = await sql<PatientRow>`
    UPDATE patients
       SET edited           = ${JSON.stringify(next.edited)}::jsonb,
           recommendations  = ${next.recommendations},
           indication       = ${next.indication},
           additional_notes = ${next.additional_notes},
           status           = ${next.status},
           updated_at       = now()
     WHERE id = ${id}
     RETURNING *;
  `;
  return rows[0] ?? null;
}

export async function deletePatient(id: string): Promise<void> {
  await ensureSchema();
  await sql`DELETE FROM patients WHERE id = ${id};`;
}
