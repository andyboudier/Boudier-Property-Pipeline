# Boudier Property — Site Appraisal

A site-acquisition appraisal app for **Boudier Property**. Screen the live
pipeline at a glance, then work each site through three stages — **DCAS → MAC →
IPAD** — with a traffic-light **procedability** verdict that updates from the
criteria you record.

> _Intelligent Development, Lasting Value._

- **Front end:** Next.js 14 (App Router) + TypeScript + Tailwind
- **Data:** Google Firestore (with a built-in in-memory demo mode)
- **Hosting:** Vercel

---

## What it does

1. **Pipeline search page** — every site with its Town & LPA, size, guide price,
   stage progress and a **Proceedable / Review / Not proceedable / Incomplete**
   badge. Free-text search + status filters.
2. **Property workspace** — open a site to see the snapshot, procedability
   checks and the planning brief, with three stage buttons:
   - **DCAS** — Deal Criteria Assessment. Rate each criterion 1 (Critical) → 5
     (Excellent). Header fields and the purchase-price line auto-populate from
     the pipeline. **PDF/Print** produces a clean A4 sheet for external appraisal.
   - **MAC** — Market Area Comparison. Capture comparable listings per bed-type
     segment; £/m², days on market and sales ratio compute automatically.
   - **IPAD** — Initial Project Appraisal. Full residual: enter unit GDV and
     costs and net profit / profit-on-GDV update live.
3. **Procedability criteria** — editable thresholds (min/max ft², target profit
   on GDV, DCAS tolerances) under **Criteria**.

---

## Quick start (demo mode — no setup)

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. With no Firebase credentials the app runs against
an **in-memory demo store** seeded with the real pipeline (the header shows a
“Demo data” pill). Edits persist for the life of the dev process but are not
durable — connect Firestore for that.

---

## Connect Firestore (durable data)

1. **Create a project** in the [Firebase console](https://console.firebase.google.com/)
   and enable **Firestore Database** (production mode).
2. **Service account:** Project settings → _Service accounts_ → _Generate new
   private key_. This downloads a JSON file.
3. **Environment variables** — copy `.env.example` to `.env.local` and fill in
   from that JSON:

   ```bash
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
   # keep the quotes; \n stays literal
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"
   ```

4. **Seed the database** with the demo pipeline (optional but recommended):

   ```bash
   npm run seed
   ```

   This writes every property to the `properties` collection and the default
   thresholds to `settings/procedability`. It’s idempotent — safe to re-run.

5. `npm run dev` again — the header now shows a green **“Firestore”** pill.

### Data model

One document per property in `properties/{id}` holds the pipeline fields plus
the nested `dcas`, `mac` and `ipad` objects (kept together for atomic reads).
Thresholds live in `settings/procedability`.

---

## Deploy to Vercel

1. Push this repo to GitHub/GitLab and **Import Project** in Vercel (framework
   preset: **Next.js** — no config needed).
2. Add the three `FIREBASE_*` environment variables in **Project → Settings →
   Environment Variables** (Production + Preview). Paste the private key with its
   `\n` sequences intact, wrapped in quotes.
3. Deploy. Run `npm run seed` once locally (pointing at the same project) to
   populate Firestore, or add sites via **+ Add site**.

> Serverless functions are stateless, so the in-memory demo store does **not**
> persist on Vercel — Firestore credentials are required for live use.

---

## Rebranding

The palette is driven by CSS variables, so a brand refresh is a one-line change.
Edit `src/app/globals.css`:

```css
:root {
  --ink: #16202b;        /* primary brand ink (charcoal-navy) */
  --bronze: #b08d57;     /* metallic accent */
  --paper-warm: #f7f6f3; /* background */
  --paper-line: #e7e4de; /* hairline borders */
}
```

For Tailwind utility classes (e.g. `text-ink`, `bg-bronze`) update the matching
hex in `tailwind.config.ts`. Swap the logo mark in `src/components/Wordmark.tsx`
(replace the inline SVG with your own, or an `<img>`). Fonts are Fraunces (serif)
+ Inter (sans) via `next/font` in `src/app/layout.tsx`.

_The colours and logo here are a tasteful placeholder — drop in Boudier’s exact
brand hex and logo to finish._

---

## How procedability is decided

Defined in `src/lib/procedability.ts`. A traffic-light where **the worst outcome
wins** across every stage:

| Check | Pass | Warn (→ Review) | Fail (→ Not proceedable) |
|---|---|---|---|
| **Size gate** | within min–max ft² | above the ceiling | below the minimum |
| **DCAS screen** | no Critical, Concerning within tolerance | Concerning over tolerance | any Critical rating |
| **DCAS completeness** | ≥ target % answered | below target | — |
| **IPAD viability** | profit on GDV ≥ target | between target and floor | below the floor |
| **MAC demand** (soft) | sales ratio ≥ 50% | sales ratio < 50% | — |

Any **fail** → _Not proceedable_. Otherwise any **warn** (or a missing hard
check) → _Review_. Too little captured to judge → _Incomplete_. Everything clear
→ _Proceedable_. Thresholds are editable on the **Criteria** page.

The IPAD residual (`src/lib/ipadCalc.ts`) reproduces the spreadsheet logic,
including `net profit = GDV − total cost of development + VAT`.

---

## Project structure

```
src/
  app/
    page.tsx                     Pipeline / search
    property/[id]/page.tsx       Property overview (stage buttons)
    property/[id]/dcas/…         DCAS form + A4 print view
    property/[id]/mac/page.tsx   MAC workbench
    property/[id]/ipad/page.tsx  IPAD residual
    property/new/page.tsx        Add site
    settings/page.tsx            Procedability criteria
    actions.ts                   Server actions (save/create)
  components/                    Client forms + UI
  lib/
    types.ts  dcasSchema.ts  macCalc.ts  ipadCalc.ts
    procedability.ts  db.ts  firebaseAdmin.ts  seedData.ts  format.ts
    seed.ts                      `npm run seed`
```

---

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` | Production build |
| `npm start` | Run the production build |
| `npm run seed` | Push the demo pipeline to Firestore |
| `npm run lint` | Lint |
