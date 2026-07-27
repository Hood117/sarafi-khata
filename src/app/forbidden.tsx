import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function ForbiddenPage() {
  return (
    <div className="flex flex-1 flex-col items-start justify-center gap-4 p-8">
      <div className="max-w-md space-y-2">
        <p className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
          403
        </p>
        <h1 className="text-foreground text-2xl font-semibold tracking-tight">
          Access denied
        </h1>
        <p className="text-muted-foreground text-sm leading-6">
          Your role does not have permission to view this page or perform this
          action.
        </p>
      </div>

      <Button render={<Link href="/" />} className="rounded-full">
        Back to Dashboard
      </Button>
    </div>
  );
}
