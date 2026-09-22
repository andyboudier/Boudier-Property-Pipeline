import { redirect } from "next/navigation";

// Prospects are split into commercial and residential areas.
export default function ProspectsPage() {
  redirect("/prospects/commercial");
}
