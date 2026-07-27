import { z } from "zod";

const auditValuesSchema = z.record(z.string(), z.unknown()).nullable().optional();

/**
 * Soft validation for audit write payloads.
 * Invalid input is skipped by the service (never thrown to callers).
 */
export const recordAuditEventSchema = z.object({
  userId: z.string().min(1).nullable().optional(),
  action: z.string().trim().min(1).max(128),
  module: z.string().trim().min(1).max(64),
  entityType: z.string().trim().min(1).max(64).nullable().optional(),
  entityId: z.string().trim().min(1).max(128).nullable().optional(),
  ipAddress: z.string().trim().min(1).max(128).nullable().optional(),
  beforeValues: auditValuesSchema,
  afterValues: auditValuesSchema,
});

export type RecordAuditEventSchemaOutput = z.infer<
  typeof recordAuditEventSchema
>;
