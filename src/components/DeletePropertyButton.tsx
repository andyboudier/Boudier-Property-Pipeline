"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { actionDeleteProperty } from "@/app/actions";

export function DeletePropertyButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onDelete() {
    const ok = window.confirm(
      `Delete "${name}" from the pipeline?\n\nThis permanently removes the site and its DCAS / MAC / IPAD data. This cannot be undone.`,
    );
    if (!ok) return;
    startTransition(async () => {
      await actionDeleteProperty(id);
      router.push("/");
      router.refresh();
    });
  }

  return (
    <button
      onClick={onDelete}
      disabled={pending}
      className="btn-ghost text-sm hover:border-status-stop hover:text-status-stop disabled:opacity-60"
    >
      {pending ? "Deleting…" : "Delete site"}
    </button>
  );
}
