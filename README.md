# FibroScan Reviewer (web)

Web version of the FibroScan reviewer, deployable to Vercel. Receptionists
upload the FibroScan 530 Compact PDF; the app parses it, computes the fibrosis
stage from LSM and the steatosis grade from CAP, and stores the result. Reading
physicians can verify or correct any value, write recommendations, and mark
the report **Completed** (green) once signed off — all changes are shared in
real time with everyone holding the link.

## Deploying

See **[DEPLOY.md](./DEPLOY.md)** for a step-by-step, no-command-line guide.

## Medical thresholds

The grading logic lives in [`lib/grading.ts`](./lib/grading.ts) with full
citations. Summary:

**Steatosis (CAP, dB/m)** — default Karlas IPD meta-analysis 2017 (n=2735,
mixed etiology):

| Grade | CAP cutoff (Karlas) |
|-------|---------------------|
| S0    | < 248               |
| S1    | 248 – 267           |
| S2    | 268 – 279           |
| S3    | >= 280              |

For NAFLD/MASLD patients the app switches to Eddowes 2019 biopsy-validated
cutoffs (302 / 331 / 337 dB/m), and flags CAP >= 275 dB/m as the AASLD 2024 /
EASL 2021 rapid rule-in for any steatosis.

**Fibrosis (LSM, kPa)** — etiology-specific cutoffs from EASL CPG 2021,
WHO 2024 (HBV), Castera (HCV), and Nguyen-Khac (ALD). Rule-out < 8 kPa and
rule-in >= 12.5 kPa flags are applied per EASL 2021.

## What got better vs the desktop version (`../app.py`)

1. **Etiology-aware steatosis grading**. The desktop app used only Karlas
   thresholds; the new app applies Eddowes for NAFLD/MASLD when the physician
   sets the etiology context, with a sensitivity flag at the AASLD 275 dB/m
   threshold.
2. **No more "Success Rate: 1.25 m/s" bug** — the old DOCX template
   accidentally pulled the SWS value into the success-rate cell. The web app
   computes success rate from the valid-measurement count.
3. **Steatosis grade renders as "S0" not "0"** — the old template lost the
   leading "S" because of a placeholder collision; the web app uses the
   programmatic docx builder.
4. **Physician edits and recommendations persist in Postgres**, visible to
   anyone with the link.
5. **Status badge** — patient cards are highlighted orange (in progress) or
   green (completed) as the user requested.

## Local development (optional)

```
npm install
# Create a .env.local with POSTGRES_URL / BLOB_READ_WRITE_TOKEN from Vercel
# Storage (Vercel CLI: vercel link && vercel env pull .env.local)
npm run dev
```

Open <http://localhost:3000>.
