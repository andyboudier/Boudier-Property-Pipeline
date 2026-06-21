import "server-only";
import { cookies, headers } from "next/headers";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from "@simplewebauthn/server";
import { GATE_COOKIE, gateCode, gateToken } from "./gate";
import { listPasskeys, getPasskey, addPasskey, updatePasskeyCounter } from "./db";

const RP_NAME = "Boudier Property";
const CHALLENGE_COOKIE = "boudier_wa_chal";

// Derive the Relying Party ID + origin from the incoming request host so this
// works on whatever domain the app is served from (no hardcoded domain).
function rp() {
  const h = headers();
  const host = (h.get("x-forwarded-host") || h.get("host") || "localhost:3000").split(",")[0].trim();
  const rpID = host.split(":")[0];
  const proto = rpID === "localhost" || rpID.startsWith("127.") ? "http" : "https";
  return { rpID, origin: `${proto}://${host}` };
}

function setChallenge(ch: string) {
  cookies().set(CHALLENGE_COOKIE, ch, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 300 });
}
function readChallenge(): string | undefined {
  return cookies().get(CHALLENGE_COOKIE)?.value;
}
function clearChallenge() {
  cookies().delete(CHALLENGE_COOKIE);
}

type Transport = "usb" | "ble" | "nfc" | "internal" | "hybrid";

export async function passkeyRegisterOptions() {
  const { rpID } = rp();
  const existing = await listPasskeys();
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName: "Boudier Property",
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({ id: c.id, transports: c.transports as Transport[] | undefined })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
      authenticatorAttachment: "platform", // Touch ID / Windows Hello, not roaming keys
    },
  });
  setChallenge(options.challenge);
  return options;
}

export async function passkeyRegisterVerify(response: RegistrationResponseJSON, label: string) {
  const { rpID, origin } = rp();
  const expectedChallenge = readChallenge();
  if (!expectedChallenge) return { ok: false as const, error: "Challenge expired — try again." };
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
  clearChallenge();
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

export async function passkeyAuthOptions() {
  const { rpID } = rp();
  const creds = await listPasskeys();
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
    allowCredentials: creds.map((c) => ({ id: c.id, transports: c.transports as Transport[] | undefined })),
  });
  setChallenge(options.challenge);
  return { options, hasCredentials: creds.length > 0 };
}

export async function passkeyAuthVerify(response: AuthenticationResponseJSON) {
  const { rpID, origin } = rp();
  const expectedChallenge = readChallenge();
  if (!expectedChallenge) return { ok: false as const, error: "Challenge expired — try again." };
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
  clearChallenge();
  if (!verification.verified) return { ok: false as const, error: "Not verified" };
  await updatePasskeyCounter(cred.id, verification.authenticationInfo.newCounter);

  const code = gateCode();
  if (code) {
    cookies().set(GATE_COOKIE, await gateToken(code), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return { ok: true as const };
}
