import "server-only";

import { Prisma, type HawalaDirection } from "@/generated/prisma/client";
import { HawalaError } from "@/features/hawala/domain/errors";
import type { HawalaTransferRecord } from "@/features/hawala/domain/types";
import {
  createHawalaTransfer,
  findHawalaTransferByReference,
} from "@/features/hawala/repositories/hawala-repository";
import {
  receiveHawalaSchema,
  sendHawalaSchema,
  toHawalaFieldErrors,
} from "@/features/hawala/schemas/hawala";
import { postHawalaMovement } from "@/features/hawala/services/post-hawala-movement";
import { resolveHawalaContext } from "@/features/hawala/services/resolve-hawala-context";
import { prisma } from "@/server/db";

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

type CreateHawalaParams = {
  direction: HawalaDirection;
  input: unknown;
  createdById: string;
};

async function assertOperator(createdById: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: createdById } });
  if (!user) {
    throw new HawalaError("NOT_FOUND", "Operator was not found.", {
      createdById: "Operator was not found.",
    });
  }
  if (!user.isActive) {
    throw new HawalaError(
      "INACTIVE",
      "Operator is inactive and cannot create hawala transfers.",
      { createdById: "Operator is inactive." },
    );
  }
}

/**
 * Creates a PENDING hawala transfer, posts the financial legs via
 * postTransaction, then marks the transfer COMPLETED.
 *
 * If posting fails after create, the row remains PENDING for complete/cancel.
 */
export async function createAndPostHawala(
  params: CreateHawalaParams,
): Promise<HawalaTransferRecord> {
  const schema =
    params.direction === "SEND" ? sendHawalaSchema : receiveHawalaSchema;
  const parsed = schema.safeParse(params.input);

  if (!parsed.success) {
    throw new HawalaError(
      "VALIDATION",
      "Please correct the highlighted fields.",
      toHawalaFieldErrors(parsed.error),
    );
  }

  await assertOperator(params.createdById);

  const existing = await findHawalaTransferByReference(parsed.data.reference);
  if (existing) {
    throw new HawalaError(
      "CONFLICT",
      `Hawala reference "${parsed.data.reference}" already exists.`,
      { reference: "Reference already exists." },
    );
  }

  const context = await resolveHawalaContext(parsed.data);

  let pending;
  try {
    pending = await createHawalaTransfer({
      reference: context.data.reference,
      direction: params.direction,
      status: "PENDING",
      senderName: context.senderName,
      senderPhone: context.senderPhone,
      receiverName: context.receiverName,
      receiverPhone: context.receiverPhone,
      partnerSarafi: context.data.partnerSarafi,
      originCity: context.data.originCity,
      originCountry: context.data.originCountry,
      destinationCity: context.data.destinationCity,
      destinationCountry: context.data.destinationCountry,
      currencyId: context.currency.id,
      amount: new Prisma.Decimal(context.amountMajor),
      notes: context.data.notes,
      customerId: context.customerId,
      senderCustomerId: context.senderCustomerId,
      receiverCustomerId: context.receiverCustomerId,
      cashWalletId: context.cashWallet.id,
      clearingWalletId: context.clearingWallet.id,
      createdById: params.createdById,
      valueDate: context.valueDate,
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new HawalaError(
        "CONFLICT",
        `Hawala reference "${context.data.reference}" already exists.`,
        { reference: "Reference already exists." },
      );
    }
    throw error;
  }

  return postHawalaMovement({
    hawala: pending,
    direction: params.direction,
    currencyCode: context.currencyCode,
    money: context.money,
    createdById: params.createdById,
  });
}
