"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { joinWorkspace } from "@/lib/actions";

export function JoinButton({ token }: { token: string }) {
  const [result, action, pending] = useActionState(joinWorkspace, null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="token" value={token} />
      <Button type="submit" variant="primary" size="lg" disabled={pending} className="w-full">
        {pending ? <Spinner className="[&>span.spin-cell]:bg-on-accent/40" /> : null}
        Join workspace <Icon name="arrow-right" />
      </Button>
      {result && !result.ok ? <p className="text-xs text-hematite">{result.message}</p> : null}
    </form>
  );
}
