import "server-only";
import { headers } from "next/headers";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from "@simplewebauthn/server";
import { listPasskeys, getPasskey, addPasskey, updatePasskeyCounter } from "./db";

// Pure WebAuthn helpers — cookie handling lives in the route handlers so the
// challenge/gate cookies are set reliably on the response.

const RP_NAME = "Boudier Property";
type Transport = "usb" | "ble" | "nfc" | "internal" | "hybrid";

function rp() {
  const h = headers();
  const host = (h.get("x-forwarded-host") || h.get("host") || "localhost:3000").split(",")[0].trim();
  const rpID = host.split(":")[0];
  const proto = rpID === "localhost" || rpID.startsWith("127.") ? "http" : "https";
  return { rpID, origin: `${proto}://${host}` };
}

export async function buildRegisterOptions() {
  const { rpID } = rp();
  const existing = await listPasskeys();
  return generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName: "Boudier Property",
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({ id: c.id, transports: c.transports as Transport[] | undefined })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
      authenticatorAttachment: "platform",
    },
  });
}

export async function verifyRegister(response: RegistrationResponseJSON, label: string, expectedChallenge?: string) {
  if (!expectedChallenge) return { ok: false as const, error: "Challenge expired — try again." };
  const { rpID, origin } = rp();
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Verification failed" };
  }
  if (!verification.verified || !verification.registrationInfo) return { ok: false as const, error: "Not verified" };
  const c = verification.registrationInfo.credential;
  await addPasskey({
    id: c.id,
    publicKey: isoBase64URL.fromBuffer(c.publicKey),
    counter: c.counter ?? 0,
    transports: c.transports,
    label: label?.trim() || "This device",
    createdAt: new Date().toISOString(),
  });
  return { ok: true as const };
}

export async function buildAuthOptions() {
  const { rpID } = rp();
  const creds = await listPasskeys();
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
    allowCredentials: creds.map((c) => ({ id: c.id, transports: c.transports as Transport[] | undefined })),
  });
  return { options, hasCredentials: creds.length > 0 };
}

export async function verifyAuth(response: AuthenticationResponseJSON, expectedChallenge?: string) {
  if (!expectedChallenge) return { ok: false as const, error: "Challenge expired — try again." };
  const { rpID, origin } = rp();
  const cred = await getPasskey(response.id);
  if (!cred) return { ok: false as const, error: "This device isn't registered." };
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
      credential: {
        id: cred.id,
        publicKey: isoBase64URL.toBuffer(cred.publicKey),
        counter: cred.counter,
        transports: cred.transports as Transport[] | undefined,
      },
    });
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Verification failed" };
  }
  if (!verification.verified) return { ok: false as const, error: "Not verified" };
  await updatePasskeyCounter(cred.id, verification.authenticationInfo.newCounter);
  return { ok: true as const };
}
