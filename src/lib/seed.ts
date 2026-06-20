/**
 * Seed Firestore with the demo pipeline.
 *
 *   npm run seed
 *
 * Reads FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY from
 * the environment (or a local .env.local / .env file). Writes every property to
 * the `properties` collection and the default thresholds to settings/procedability.
 *
 * Safe to re-run — it overwrites the same document IDs (idempotent).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { SEED_PROPERTIES } from "./seedData";
import { DEFAULT_SETTINGS } from "./procedability";

// ── Minimal .env loader (no extra dependency) ────────────────────────────────
function loadEnvFile(file: string) {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnvFile(".env.local");
loadEnvFile(".env");

async function main() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    console.error(
      "\n✗ Missing Firebase credentials.\n" +
        "  Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY\n" +
        "  in .env.local (see .env.example) before running the seed.\n",
    );
    process.exit(1);
  }
  privateKey = privateKey.replace(/\\n/g, "\n");

  const app = getApps()[0] ?? initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  const db = getFirestore(app);

  const now = new Date().toISOString();
  console.log(`Seeding ${SEED_PROPERTIES.length} properties into "${projectId}"…`);

  const batch = db.batch();
  for (const p of SEED_PROPERTIES) {
    const { id, ...data } = p;
    const ref = db.collection("properties").doc(id);
    batch.set(ref, JSON.parse(JSON.stringify({ ...data, createdAt: now, updatedAt: now })));
    console.log(`  • ${id}`);
  }
  batch.set(db.collection("settings").doc("procedability"), DEFAULT_SETTINGS);
  await batch.commit();

  console.log("\n✓ Seed complete. Default procedability criteria written to settings/procedability.\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
