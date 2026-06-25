# Deploy the FibroScan Reviewer to Vercel

A copy-paste guide. Total time: ~10 minutes. No command line required.

## What you'll get

A shared web app at `https://your-name.vercel.app` where:

- Receptionists upload FibroScan PDFs by dragging them into the page.
- Reading physicians open each report, verify or correct the auto-graded
  fibrosis (LSM) and steatosis (CAP) values, write recommendations, and click
  **Save & Mark Completed**.
- Everyone with the URL sees the same data in real time.
- Patient cards are highlighted **orange** while in progress and **green** once
  signed off.

---

## Step 1 — Make a GitHub repository

1. Go to <https://github.com/new>.
2. Repo name: `fibroscan-reviewer` (anything you like). Set it to **Private**.
   Click **Create repository**.
3. On the empty-repo page click **uploading an existing file**.
4. Drag the entire contents of the `fibroscan-web/` folder into the upload box
   (the `app/`, `lib/`, `public/` folders, plus `package.json`,
   `next.config.js`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.js`,
   `.gitignore`).
5. Click **Commit changes**.

> Tip: if you prefer the GitHub Desktop app, drop the `fibroscan-web/` files in
> a local clone of the repo and push.

## Step 2 — Import into Vercel

1. Go to <https://vercel.com/new> (sign in with GitHub if needed).
2. Click **Import** next to your `fibroscan-reviewer` repo.
3. Leave all defaults. Click **Deploy**.
4. The first build takes ~1 minute. When done, you'll see a URL like
   `fibroscan-reviewer-xxxx.vercel.app`. It will work but uploads will fail
   until you add storage — that's the next step.

## Step 3 — Add a Postgres database

1. In the Vercel dashboard, open your project.
2. Click **Storage** in the left sidebar (or top navigation).
3. Click **Create Database** -> choose **Postgres** (Vercel's "Neon"-backed
   option) -> name it `fibroscan-db` -> region closest to your clinic.
4. After it's created, click the database, then **Connect Project** and choose
   your `fibroscan-reviewer` project. Pick **All environments**.

Vercel will automatically add the `POSTGRES_*` environment variables to your
project. No copy/paste of credentials needed.

## Step 4 — Add Blob storage (for PDFs)

1. Still in **Storage**, click **Create** -> choose **Blob** -> name it
   `fibroscan-pdfs`.
2. Click **Connect Project** -> select your project -> **All environments**.

This adds `BLOB_READ_WRITE_TOKEN` automatically.

## Step 5 — Add the Groq API key (for AI suggestions — free)

The **Get AI Suggestion** button is powered by Groq's free LLM API
(Llama 3.3 70B). Groq offers a generous free tier with no credit card required.

1. Go to <https://console.groq.com> and sign up / sign in (free).
2. Click **API Keys** in the left sidebar -> **Create API Key** -> copy the key
   (starts with `gsk_`).
3. Back in Vercel, open your project -> **Settings** -> **Environment Variables**.
4. Click **Add** and fill in:
   - **Name**: `GROQ_API_KEY`
   - **Value**: paste your key
   - **Environments**: check Production, Preview, and Development
5. Click **Save**.

> The AI suggestion feature is optional — all other functionality (PDF upload,
> grading, save, .docx download) works without this key. If the key is missing,
> clicking "Get AI Suggestion" will show an error but won't break anything else.

## Step 6 — Redeploy so the new env vars take effect

1. Go to **Deployments** in your project.
2. On the latest deployment, click the **...** menu -> **Redeploy** ->
   confirm **Use existing Build Cache: No** -> **Redeploy**.

When it goes green, you're live. Open the URL.

## Step 7 — Share with your team

Copy the production URL (e.g. `https://fibroscan-reviewer.vercel.app`) and
send it to the physicians and receptionists. They don't need a Vercel account
or any login — anyone with the link can view and edit.

> Want to lock it down later? In the Vercel project go to
> **Settings -> Deployment Protection** -> turn on **Vercel Authentication**.
> Each user signs in with email magic link.

---

## Daily workflow

**Receptionist:**

1. Open the URL.
2. Click **Upload PDF** -> pick the FibroScan PDF.
3. The patient appears in the list as an **orange** card.

**Reading physician:**

1. Open the URL.
2. Click an orange card.
3. Verify the auto-extracted LSM and CAP scores. Correct anything wrong.
4. Adjust **Etiology Context** if appropriate (NAFLD uses Eddowes thresholds;
   other etiologies use Karlas thresholds).
5. Type into **Recommendations**, or click **Get AI Suggestion** to have Claude
   draft a recommendation based on prior reports with similar clinical findings.
   Review and edit the suggestion before saving.
6. Click **Save & Mark Completed**. The card turns **green** for everyone.
7. Optionally click **Download .docx** to get the printable report.

## Updating the app later

Any time you push a commit to your GitHub repo, Vercel rebuilds automatically.
For a non-developer: just edit a file in the GitHub web UI and click commit.

## Troubleshooting

- **Upload returns 500**: Open Vercel -> your project -> the failing
  deployment -> **Runtime Logs**. Most often this means storage isn't
  connected; redo Steps 3-5.
- **PDF parses with missing fields**: the parser is tuned for FibroScan 530
  Compact reports. Other devices may need regex tweaks in
  `lib/parser.ts`.
- **"Get AI Suggestion" shows an error**: check that `GROQ_API_KEY` is set
  in Vercel -> Settings -> Environment Variables (get a free key at
  console.groq.com), then redeploy.
- **Need to wipe the database**: in Vercel Storage -> Postgres -> Data tab,
  run `DELETE FROM patients;`.
