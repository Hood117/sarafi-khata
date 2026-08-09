import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Typography } from "@/design-system/typography";

export default function AuditNotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-start gap-4 py-10">
      <Typography variant="h3" as="h2">
        Audit event not found
      </Typography>
      <Typography variant="muted">
        This audit event may have been removed or the link is invalid.
      </Typography>
      <Button render={<Link href="/settings?tab=audit" />}>Back to audit</Button>
    </div>
  );
}
