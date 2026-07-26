import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Typography } from "@/design-system/typography";

export default function CustomerNotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-start gap-4 py-10">
      <Typography variant="h3" as="h2">
        Customer not found
      </Typography>
      <Typography variant="muted">
        This customer may have been archived or the link is invalid.
      </Typography>
      <Button render={<Link href="/customers" />}>Back to customers</Button>
    </div>
  );
}
