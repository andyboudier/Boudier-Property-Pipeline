import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

// Microsoft Entra SSO, mirroring the ACT Halo app. Access is gated on the
// Entra "groups" claim (see authConfig.ts / middleware.ts), and the delegated
// Graph token is kept on the session so the app can read/write the signed-in
// user's calendar and To Do lists (Project Management section).

// .Shared scopes so a user can read/write the calendar + To Do list Vanessa has
// shared with them (the Project Management section works from her shared items).
const SCOPE = "openid profile email offline_access User.Read Calendars.ReadWrite.Shared Tasks.ReadWrite.Shared";

const ISSUER = process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER || "";
// Entra v2 token endpoint, derived from the issuer (…/v2.0 → …/oauth2/v2.0/token).
const TOKEN_URL = ISSUER.replace(/\/v2\.0\/?$/, "") + "/oauth2/v2.0/token";

// Pull the "groups" claim (array of group object IDs) out of the ID token.
function decodeGroups(idToken: string | undefined): string[] {
  if (!idToken) return [];
  try {
    let p = idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    while (p.length % 4) p += "=";
    const json = JSON.parse(
      typeof atob === "function" ? atob(p) : Buffer.from(p, "base64").toString("utf8"),
    );
    return Array.isArray(json.groups) ? json.groups : [];
  } catch {
    return [];
  }
}

interface TokenShape {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  groups?: string[];
  error?: string;
  [k: string]: unknown;
}

async function refreshAccessToken(token: TokenShape): Promise<TokenShape> {
  try {
    const body = new URLSearchParams({
      client_id: process.env.AUTH_MICROSOFT_ENTRA_ID_ID || "",
      client_secret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET || "",
      grant_type: "refresh_token",
      refresh_token: token.refreshToken || "",
      scope: SCOPE,
    });
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || "refresh failed");
    return {
      ...token,
      accessToken: data.access_token,
      expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
      refreshToken: data.refresh_token || token.refreshToken,
      error: undefined,
    };
  } catch {
    return { ...token, error: "RefreshAccessTokenError" };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
      authorization: { params: { scope: SCOPE } },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      const t = token as TokenShape;
      // Initial sign-in: stash the tokens.
      if (account) {
        t.accessToken = account.access_token;
        t.refreshToken = account.refresh_token;
        t.expiresAt = account.expires_at ? account.expires_at * 1000 : Date.now() + 3500 * 1000;
        t.groups = decodeGroups(account.id_token);
        return t;
      }
      // Still valid (>1 min headroom)? use as-is.
      if (t.expiresAt && Date.now() < t.expiresAt - 60_000) return t;
      // Otherwise refresh if we can.
      if (t.refreshToken) return refreshAccessToken(t);
      return t;
    },
    async session({ session, token }) {
      const t = token as TokenShape;
      const s = session as typeof session & { accessToken?: string; groups?: string[]; error?: string };
      s.accessToken = t.accessToken;
      s.groups = t.groups || [];
      s.error = t.error;
      return s;
    },
  },
});

/** The signed-in user's delegated Graph access token, or null. */
export async function getGraphToken(): Promise<string | null> {
  const session = await auth();
  const s = session as (typeof session & { accessToken?: string; error?: string }) | null;
  if (!s?.user || !s.accessToken || s.error) return null;
  return s.accessToken;
}
