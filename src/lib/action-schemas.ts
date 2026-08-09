import { z } from "zod";

/** Shared id check for archive / edit / cancel style server actions. */
export const entityIdSchema = z
  .string()
  .trim()
  .min(1, { error: "Id is required." });

export const setActiveActionSchema = z.object({
  id: entityIdSchema,
  isActive: z.boolean(),
});

export type SetActiveActionInput = z.infer<typeof setActiveActionSchema>;

export function parseEntityId(id: unknown): string | null {
  const parsed = entityIdSchema.safeParse(id);
  return parsed.success ? parsed.data : null;
}

export function parseSetActiveAction(
  id: unknown,
  isActive: unknown,
): SetActiveActionInput | null {
  const parsed = setActiveActionSchema.safeParse({ id, isActive });
  return parsed.success ? parsed.data : null;
}
