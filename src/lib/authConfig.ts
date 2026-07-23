// SSO access control. Mirrors the ACT Halo app: sign-in is via Microsoft Entra
// and access is gated by membership of an Entra security group whose object ID
// is baked in below (overridable by env).
//
// Graceful activation: SSO only engages once the Entra app credentials are
// configured (AUTH_MICROSOFT_ENTRA_ID_ID / _SECRET / _ISSUER). Until then the
// app stays open, so it keeps working before the Azure setup is finished.

// The Entra security group whose members may use the app.
export const ACCESS_GROUP_ID =
  process.env.BOUDIER_ACCESS_GROUP_ID || "7605df9e-3684-4ab0-a759-0bc72d2b8db6";

export function isAuthConfigured(): boolean {
  return !!(
    process.env.AUTH_MICROSOFT_ENTRA_ID_ID &&
    process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET &&
    process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER &&
    process.env.AUTH_SECRET // NextAuth needs this — don't gate until it's set too
  );
}

// A signed-in user has access if they're a member of the access group. If the
// group ID isn't set at all (shouldn't happen — it has a default), any signed-in
// tenant user is allowed rather than locking everyone out.
export function hasAccess(groups: string[] | undefined | null): boolean {
  if (!ACCESS_GROUP_ID) return true;
  return Array.isArray(groups) && groups.includes(ACCESS_GROUP_ID);
}
