// Lightweight shared-PIN gate. Edge-safe (no Node-only APIs) so it can be used
// from middleware as well as server actions. The PIN itself lives in the
// APP_ACCESS_CODE env var (never committed); the cookie stores a hash of it.
export const GATE_COOKIE = "boudier_gate";
export const WA_CHALLENGE_COOKIE = "boudier_wa_chal";

export function gateCode(): string | undefined {
  const c = process.env.APP_ACCESS_CODE;
  return c && c.trim() ? c.trim() : undefined; // undefined → gate disabled
}

export async function gateToken(code: string): Promise<string> {
  const data = new TextEncoder().encode(`boudier-gate:${code}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
