"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

type AppErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

/**
 * Catches uncaught render/data errors under the authenticated app shell.
 * Keeps the shell chrome when possible and offers a one-click retry.
 */
export default function AppError({ error, reset }: AppErrorProps) {
  useEffect(() => {
    console.error("App route error:", error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-start gap-4 py-10">
      <div className="space-y-2">
        <p className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
          Something went wrong
        </p>
        <h1 className="text-foreground text-2xl font-semibold tracking-tight">
          Unable to load this page
        </h1>
        <p className="text-muted-foreground text-sm leading-6">
          An unexpected error occurred. You can try again, or go back to the
          dashboard.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" className="rounded-full" onClick={reset}>
          Try again
        </Button>
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          onClick={() => {
            window.location.href = "/";
          }}
        >
          Back to Dashboard
        </Button>
      </div>
    </div>
  );
}
