import { z } from 'zod';
import {
  ACQUIRED_AS,
  BOX_CONDITIONS,
  CONDITIONS,
  MATCH_STATUSES,
  STATUSES,
  VARIANTS,
} from '@/db/schema';

/**
 * Every API input is validated here. Form fields arrive as empty strings when
 * cleared, which is semantically null, so text fields normalise "" -> null
 * rather than writing empty strings into the database.
 */

const nullableText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value == null || value === '' ? null : value));

const nullableCents = z
  .number()
  .int('Currency must be whole cents — no fractional pennies.')
  .min(0)
  .max(100_000_000)
  .nullish()
  .transform((value) => value ?? null);

/** Matches an <input type="date"> value. */
const nullableDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD date.')
  .nullish()
  .transform((value) => (value == null || value === '' ? null : value));

const nullableUrl = z
  .string()
  .trim()
  .url('Expected a valid URL.')
  .max(2000)
  .nullish()
  .transform((value) => (value == null || value === '' ? null : value));

/** UPCs are 8–14 digits (UPC-E through GTIN-14). Punctuation is stripped. */
const nullableUpc = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s-]/g, ''))
  .refine((value) => value === '' || /^\d{8,14}$/.test(value), {
    message: 'A UPC is 8 to 14 digits.',
  })
  .nullish()
  .transform((value) => (value == null || value === '' ? null : value));

const popFields = {
  name: z.string().trim().min(1, 'Name is required.').max(200),
  line: nullableText(120),
  franchise: nullableText(120),
  itemNumber: z.number().int().min(0).max(100_000).nullish().transform((v) => v ?? null),

  upc: nullableUpc,
  priceChartingId: nullableText(64),
  searchOverride: nullableText(300),
  needsDisambiguation: z.boolean(),
  matchStatus: z.enum(MATCH_STATUSES),

  variant: z.enum(VARIANTS),
  exclusiveTo: nullableText(120),
  releaseYear: z.number().int().min(1980).max(2100).nullish().transform((v) => v ?? null),
  isVaulted: z.boolean(),

  condition: z.enum(CONDITIONS),
  hasBox: z.boolean(),
  boxCondition: z.enum(BOX_CONDITIONS),
  hasProtector: z.boolean(),

  quantity: z.number().int().min(1, 'Quantity must be at least 1.').max(9999),
  status: z.enum(STATUSES),

  acquiredAs: z.enum(ACQUIRED_AS),
  purchasePriceCents: nullableCents,
  purchaseDate: nullableDate,
  purchaseSource: nullableText(200),
  soldPriceCents: nullableCents,
  soldDate: nullableDate,
  manualValueCents: nullableCents,

  imageUrl: nullableUrl,
  catalogImageUrl: nullableUrl,
  notes: nullableText(4000),
} as const;

/** Creating requires a name; everything else falls back to the schema defaults. */
export const popCreateSchema = z
  .object(popFields)
  .partial()
  .required({ name: true })
  .strict();

/** Updating is fully partial — the admin UI PATCHes only what changed. */
export const popUpdateSchema = z.object(popFields).partial().strict();

export type PopCreateInput = z.infer<typeof popCreateSchema>;
export type PopUpdateInput = z.infer<typeof popUpdateSchema>;

/**
 * Bulk edit deliberately exposes only the fields worth changing across many
 * figures at once — the condition/box fields Aaron wants to correct in one pass.
 * Names, prices, and matching data are per-figure and stay out of it.
 */
export const popBulkUpdateSchema = z
  .object({
    ids: z.array(z.string().min(1)).min(1, 'Select at least one figure.').max(1000),
    patch: z
      .object({
        condition: z.enum(CONDITIONS),
        hasBox: z.boolean(),
        boxCondition: z.enum(BOX_CONDITIONS),
        hasProtector: z.boolean(),
        status: z.enum(STATUSES),
        variant: z.enum(VARIANTS),
        isVaulted: z.boolean(),
        needsDisambiguation: z.boolean(),
      })
      .partial()
      .strict()
      .refine((patch) => Object.keys(patch).length > 0, {
        message: 'Nothing to change — pick at least one field.',
      }),
  })
  .strict();

export type PopBulkUpdateInput = z.infer<typeof popBulkUpdateSchema>;

export const popIdSchema = z.string().min(1, 'A figure id is required.');
