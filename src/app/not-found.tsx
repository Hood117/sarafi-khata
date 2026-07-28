import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Typography } from "@/design-system/typography";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-start justify-center gap-4 p-8">
      <div className="space-y-2">
        <p className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
          404
        </p>
        <Typography variant="h3" as="h1">
          Page not found
        </Typography>
        <Typography variant="muted">
          This page does not exist or the link is invalid.
        </Typography>
      </div>
      <Button render={<Link href="/" />} className="rounded-full">
        Back to Dashboard
      </Button>
    </div>
  );
}
