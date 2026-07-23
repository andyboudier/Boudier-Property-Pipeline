import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { hasAccess, isAuthConfigured } from "@/lib/authConfig";
import { SignInPanel } from "./SignInPanel";

export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: { denied?: string } }) {
  // If SSO isn't configured, or the user is already signed in with access,
  // there's nothing to sign into — send them to the app.
  if (!isAuthConfigured()) redirect("/");
  const session = await auth();
  if (session?.user && hasAccess((session as { groups?: string[] }).groups)) redirect("/");

  const deniedByGroup = !!searchParams?.denied && !!session?.user;
  return <SignInPanel deniedByGroup={deniedByGroup} userName={session?.user?.name || session?.user?.email || ""} />;
}
