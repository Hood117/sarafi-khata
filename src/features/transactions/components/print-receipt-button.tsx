"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

export function PrintReceiptButton() {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => {
        window.print();
      }}
    >
      <Printer data-icon="inline-start" />
      Print Receipt
    </Button>
  );
}
