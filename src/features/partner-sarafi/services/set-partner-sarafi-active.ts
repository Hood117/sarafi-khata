import "server-only";

import type { PartnerSarafi } from "@/generated/prisma/client";
import { PartnerSarafiError } from "@/features/partner-sarafi/domain/errors";
import {
  findPartnerSarafiById,
  updatePartnerSarafi,
} from "@/features/partner-sarafi/repositories/partner-sarafi-repository";

export async function setPartnerSarafiActiveRecord(
  id: string,
  isActive: boolean,
): Promise<PartnerSarafi> {
  const existing = await findPartnerSarafiById(id);
  if (!existing) {
    throw new PartnerSarafiError("NOT_FOUND", "Partner sarafi was not found.");
  }

  return updatePartnerSarafi(id, { isActive });
}
