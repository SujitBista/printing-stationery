import { z } from "zod";

export const partyStatusFilterSchema = z.enum(["ALL", "ACTIVE", "INACTIVE"]);

const partyCodeSchema = z
  .string()
  .transform((value) => value.trim().toUpperCase())
  .pipe(
    z
      .string()
      .min(2, "Party code must be between 2 and 20 characters")
      .max(20, "Party code must be between 2 and 20 characters")
      .regex(
        /^[A-Z0-9_-]+$/,
        "Party code may only contain uppercase letters, numbers, hyphens and underscores",
      ),
  );

const partyNameSchema = z
  .string()
  .trim()
  .min(2, "Party name must be between 2 and 200 characters")
  .max(200, "Party name must be between 2 and 200 characters");

export const partySchema = z.object({
  id: z.string().uuid(),
  partyCode: z.string(),
  partyName: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createPartyInputSchema = z
  .object({
    partyCode: partyCodeSchema,
    partyName: partyNameSchema,
    isActive: z.boolean().optional().default(true),
  })
  .strict();

export const updatePartyInputSchema = z
  .object({
    partyCode: partyCodeSchema.optional(),
    partyName: partyNameSchema.optional(),
  })
  .strict()
  .refine(
    (value) => value.partyCode !== undefined || value.partyName !== undefined,
    {
      message: "At least one field must be provided",
    },
  );

export const updatePartyStatusInputSchema = z
  .object({
    isActive: z.boolean(),
  })
  .strict();

export const partyListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  status: partyStatusFilterSchema.default("ALL"),
});

export const paginatedPartyResponseSchema = z.object({
  items: z.array(partySchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export const partyIdSchema = z.string().uuid("Invalid party id");
