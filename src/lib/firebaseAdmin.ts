import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let cached: { app: App; db: Firestore } | null = null;

/**
 * Returns a Firestore instance if Firebase service-account env vars are present,
 * otherwise null (the app then runs against the in-memory demo store).
 */
export function getDb(): Firestore | null {
  if (cached) return cached.db;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) return null;

  // Vercel stores the key with literal \n — convert to real newlines.
  privateKey = privateKey.replace(/\\n/g, "\n");

  const app =
    getApps()[0] ??
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  const db = getFirestore(app);
  cached = { app, db };
  return db;
}

export const isFirestoreConfigured = () =>
  !!(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);
