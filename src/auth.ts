import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

// Microsoft Entra SSO, mirroring the ACT Halo app. Access is gated on the
// Entra "groups" claim (see authConfig.ts / middleware.ts). Requires the Entra
// app registration to emit the groups claim in the ID token.

const SCOPE = "openid profile email offline_access User.Read";

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
      if (account) {
        token.groups = decodeGroups(account.id_token);
      }
      return token;
    },
    async session({ session, token }) {
      (session as { groups?: string[] }).groups =
        (token as { groups?: string[] }).groups || [];
      return session;
    },
  },
});
