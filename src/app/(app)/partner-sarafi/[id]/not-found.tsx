import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Typography } from "@/design-system/typography";

export default function PartnerSarafiNotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-start gap-4 py-10">
      <Typography variant="h3" as="h2">
        Partner sarafi not found
      </Typography>
      <Typography variant="muted">
        This partner may have been removed or the link is invalid.
      </Typography>
      <Button render={<Link href="/partner-sarafi" />}>
        Back to partner sarafis
      </Button>
    </div>
  );
}
