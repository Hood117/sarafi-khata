import { describe, expect, it } from "vitest";

import {
  EN_ERROR_MESSAGES,
  userFacingError,
} from "../../desktop-ui/src/lib/app-error";

describe("userFacingError", () => {
  it("maps UNIQUE Transaction.reference to the reuse cause, not a generic hide", () => {
    const msg = userFacingError(
      new Error("UNIQUE constraint failed: Transaction.reference"),
      "Could not save the deposit. No changes were made.",
    );
    expect(msg).toBe(EN_ERROR_MESSAGES.duplicateReference);
    expect(msg.toLowerCase()).toContain("transaction number");
  });

  it("maps prefixed UNIQUE_TX_REFERENCE from Rust", () => {
    const msg = userFacingError(
      "UNIQUE_TX_REFERENCE: UNIQUE constraint failed: Transaction.reference",
    );
    expect(msg).toBe(EN_ERROR_MESSAGES.duplicateReference);
  });

  it("maps SQLITE_BUSY without exposing the engine", () => {
    const msg = userFacingError(new Error("database is locked"));
    expect(msg).toBe(EN_ERROR_MESSAGES.databaseBusy);
    expect(msg.toLowerCase()).not.toContain("sqlite");
  });

  it("maps foreign-key failures", () => {
    expect(userFacingError("FOREIGN KEY constraint failed")).toBe(
      EN_ERROR_MESSAGES.relatedMissing,
    );
  });

  it("uses the operation fallback for unknown technical errors", () => {
    expect(
      userFacingError(
        new Error("rusqlite panic at src/ledger/post.rs:12"),
        "Could not complete the withdrawal.",
      ),
    ).toBe("Could not complete the withdrawal.");
  });

  it("keeps backend validation sentences", () => {
    expect(userFacingError("Amount must be greater than zero.")).toBe(
      "Amount must be greater than zero.",
    );
  });
});
