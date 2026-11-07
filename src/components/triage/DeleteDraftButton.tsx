import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Deletes a draft policy version after confirmation.
 * Renders nothing for any other status: active, approved and retired versions are never deletable.
 * The database enforces the same rule (RLS delete policy: status = 'draft').
 */
export function DeleteDraftButton({ version }: { version: { id: string; status: string } }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  if (version.status !== "draft") return null;

  async function remove() {
    setBusy(true);
    const { data, error } = await supabase
      .from("policy_versions")
      .delete()
      .eq("id", version.id)
      .eq("status", "draft")
      .select("id");
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    // RLS filters silently: zero rows back means the row was not a draft (any more) or deleting is not allowed.
    if (!data?.length) {
      toast.error(`Draft ${version.id} could not be deleted. Only drafts can be deleted.`);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["policy"] });
    toast(`Draft ${version.id} deleted`);
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger
        disabled={busy}
        className="shrink-0 whitespace-nowrap text-[13px] text-text-2 hover:text-destructive hover:underline disabled:opacity-50"
      >
        Delete draft
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete draft {version.id.toUpperCase()}?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the draft permanently. Active and approved versions are not affected.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={remove}
            className={cn(buttonVariants({ variant: "destructive" }))}
          >
            Delete draft
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
