import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Typography } from "@/design-system/typography";

export default function ExchangeNotFound() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-start gap-4 py-10">
      <Typography variant="h3" as="h2">
        Exchange not found
      </Typography>
      <Typography variant="muted">
        This currency exchange does not exist or is no longer available.
      </Typography>
      <Button render={<Link href="/exchange" />}>Back to exchange</Button>
    </div>
  );
}
