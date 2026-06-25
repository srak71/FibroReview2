/**
 * Postgres helpers using @neondatabase/serverless.
 *
 * Supports both env var names that the Neon/Vercel integration creates:
 *   Production  -> POSTGRES_URL
 *   Preview     -> POSTGRES_DATABASE_URL
 *
 * The sql client is created lazily (on first use) so the module can be
 * imported at build time without needing env vars to be present.
 */

import { neon, NeonQueryFunction } from "@neondatabase/serverless";

let _sql: NeonQueryFunction<false, false> | null = null;

function getDb(): NeonQueryFunction<false, false> {
  if (_sql) return _sql;
  const connectionString =
    process.env.POSTGRES_URL ??
    process.env.POSTGRES_DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "No Postgres connection string found. Set POSTGRES_URL or POSTGRES_DATABASE_URL."
    );
  }
  _sql = neon(connectionString);
  return _sql;
}

let initialised = false;

export async function ensureSchema(): Promise<void> {
  if (initialised) return;
  const sql = getDb();
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
  await sql`
    CREATE TABLE IF NOT EXISTS recommendation_history (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id  uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      text        text NOT NULL,
      lsm         numeric,
      cap         numeric,
      fibrosis    text,
      steatosis   text,
      etiology    text,
      created_at  timestamptz NOT NULL DEFAULT now()
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS rec_history_patient_idx ON recommendation_history(patient_id);`;
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
  const sql = getDb();
  const rows = await sql`SELECT * FROM patients ORDER BY updated_at DESC;`;
  return rows as PatientRow[];
}

export async function getPatient(id: string): Promise<PatientRow | null> {
  await ensureSchema();
  const sql = getDb();
  const rows = await sql`SELECT * FROM patients WHERE id = ${id} LIMIT 1;`;
  return (rows[0] as PatientRow) ?? null;
}

export async function createPatient(args: {
  patient_name: string;
  patient_code: string | null;
  date_of_exam: string | null;
  parsed: any;
  pdf_blob_url: string | null;
}): Promise<PatientRow> {
  await ensureSchema();
  const sql = getDb();
  const rows = await sql`
    INSERT INTO patients (patient_name, patient_code, date_of_exam, parsed, pdf_blob_url)
    VALUES (
      ${args.patient_name},
      ${args.patient_code},
      ${args.date_of_exam},
      ${JSON.stringify(args.parsed)}::jsonb,
      ${args.pdf_blob_url}
    )
    RETURNING *;
  `;
  return rows[0] as PatientRow;
}

export async function updatePatient(
  id: string,
  patch: {
    edited?: Record<string, any>;
    recommendations?: string;
    indication?: string;
    additional_notes?: string;
    status?: "in_progress" | "completed";
  }
): Promise<PatientRow | null> {
  await ensureSchema();
  const sql = getDb();
  const current = await getPatient(id);
  if (!current) return null;
  const next = {
    edited: patch.edited ?? current.edited,
    recommendations: patch.recommendations ?? current.recommendations,
    indication: patch.indication ?? current.indication,
    additional_notes: patch.additional_notes ?? current.additional_notes,
    status: patch.status ?? current.status,
  };
  const rows = await sql`
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
  return (rows[0] as PatientRow) ?? null;
}

export async function deletePatient(id: string): Promise<void> {
  await ensureSchema();
  const sql = getDb();
  await sql`DELETE FROM patients WHERE id = ${id};`;
}

export interface RecommendationHistoryRow {
  id: string;
  patient_id: string;
  text: string;
  lsm: number | null;
  cap: number | null;
  fibrosis: string | null;
  steatosis: string | null;
  etiology: string | null;
  created_at: string;
}

export async function ingestRecommendation(args: {
  patient_id: string;
  text: string;
  lsm?: number | null;
  cap?: number | null;
  fibrosis?: string | null;
  steatosis?: string | null;
  etiology?: string | null;
}): Promise<void> {
  await ensureSchema();
  if (!args.text.trim()) return;
  const sql = getDb();
  await sql`
    INSERT INTO recommendation_history (patient_id, text, lsm, cap, fibrosis, steatosis, etiology)
    VALUES (
      ${args.patient_id},
      ${args.text},
      ${args.lsm ?? null},
      ${args.cap ?? null},
      ${args.fibrosis ?? null},
      ${args.steatosis ?? null},
      ${args.etiology ?? null}
    );
  `;
}

export async function similarRecommendations(args: {
  fibrosis?: string | null;
  steatosis?: string | null;
  etiology?: string | null;
  limit?: number;
}): Promise<RecommendationHistoryRow[]> {
  await ensureSchema();
  const sql = getDb();
  const limit = args.limit ?? 8;
  const rows = await sql`
    SELECT * FROM recommendation_history
    WHERE (${args.fibrosis ?? null}::text IS NULL OR fibrosis = ${args.fibrosis ?? null})
      AND (${args.etiology ?? null}::text IS NULL OR etiology = ${args.etiology ?? null})
    ORDER BY created_at DESC
    LIMIT ${limit};
  `;
  return rows as RecommendationHistoryRow[];
}
