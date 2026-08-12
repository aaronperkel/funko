import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

export const VARIANTS = [
  'common',
  'chase',
  'flocked',
  'glow',
  'diamond',
  'metallic',
  'oversized',
  'ride',
  'deluxe',
  'other',
] as const;

export const CONDITIONS = ['mint', 'near_mint', 'good', 'fair', 'loose'] as const;
export const BOX_CONDITIONS = ['mint', 'minor_damage', 'major_damage', 'none'] as const;
export const STATUSES = ['owned', 'wishlist', 'sold'] as const;
export const ACQUIRED_AS = ['bought', 'gift', 'trade', 'unknown'] as const;
export const SOURCES = ['pricecharting', 'ebay_active', 'manual'] as const;

/**
 * Pipeline state for automated price matching. Distinct from `needsDisambiguation`,
 * which is a human note that a figure's *name* is known to be ambiguous.
 */
export const MATCH_STATUSES = [
  'unmatched',
  'matched_upc',
  'pending_review',
  'confirmed',
  'rejected',
] as const;

export const CRON_STATUSES = ['running', 'completed', 'partial', 'failed'] as const;

const now = () => new Date().toISOString();

export const pops = sqliteTable(
  'pops',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    name: text('name').notNull(),
    line: text('line'),
    franchise: text('franchise'),
    itemNumber: integer('item_number'),

    // ── matching ────────────────────────────────────────────
    upc: text('upc'),
    priceChartingId: text('price_charting_id'),
    /** e.g. "Funko POP Star Wars" — match evidence, and the guard against video-game collisions. */
    priceChartingConsole: text('price_charting_console'),
    /** eBay product id, surfaced by PriceCharting; powers the sold-search link. */
    ebayEpid: text('ebay_epid'),
    matchStatus: text('match_status', { enum: MATCH_STATUSES }).notNull().default('unmatched'),
    needsDisambiguation: integer('needs_disambiguation', { mode: 'boolean' })
      .notNull()
      .default(false),
    searchOverride: text('search_override'),

    // ── identity ────────────────────────────────────────────
    variant: text('variant', { enum: VARIANTS }).notNull().default('common'),
    exclusiveTo: text('exclusive_to'),
    releaseYear: integer('release_year'),
    isVaulted: integer('is_vaulted', { mode: 'boolean' }).notNull().default(false),

    // ── condition (drives the valuation tier) ───────────────
    condition: text('condition', { enum: CONDITIONS }).notNull().default('near_mint'),
    hasBox: integer('has_box', { mode: 'boolean' }).notNull().default(true),
    boxCondition: text('box_condition', { enum: BOX_CONDITIONS })
      .notNull()
      .default('minor_damage'),
    hasProtector: integer('has_protector', { mode: 'boolean' }).notNull().default(false),

    quantity: integer('quantity').notNull().default(1),
    status: text('status', { enum: STATUSES }).notNull().default('owned'),

    // ── money: always integer cents, never floats ───────────
    acquiredAs: text('acquired_as', { enum: ACQUIRED_AS }).notNull().default('unknown'),
    purchasePriceCents: integer('purchase_price_cents'),
    purchaseDate: text('purchase_date'),
    purchaseSource: text('purchase_source'),
    soldPriceCents: integer('sold_price_cents'),
    soldDate: text('sold_date'),
    manualValueCents: integer('manual_value_cents'),

    imageUrl: text('image_url'),
    catalogImageUrl: text('catalog_image_url'),
    notes: text('notes'),

    createdAt: text('created_at').notNull().$defaultFn(now),
    updatedAt: text('updated_at').notNull().$defaultFn(now).$onUpdateFn(now),
  },
  (t) => [
    index('pops_status_idx').on(t.status),
    index('pops_franchise_idx').on(t.franchise),
    index('pops_upc_idx').on(t.upc),
    index('pops_match_status_idx').on(t.matchStatus),
  ],
);

export const priceSnapshots = sqliteTable(
  'price_snapshots',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    popId: text('pop_id')
      .notNull()
      .references(() => pops.id, { onDelete: 'cascade' }),
    source: text('source', { enum: SOURCES }).notNull(),

    loosePriceCents: integer('loose_price_cents'),
    damagedBoxPriceCents: integer('damaged_box_price_cents'),
    newPriceCents: integer('new_price_cents'),

    /** PriceCharting `sales-volume`: yearly units sold. Integer, not a label. */
    salesVolumeYearly: integer('sales_volume_yearly'),

    currency: text('currency').notNull().default('USD'),
    capturedAt: text('captured_at').notNull().$defaultFn(now),
    rawJson: text('raw_json'),
  },
  (t) => [index('price_snapshots_pop_captured_idx').on(t.popId, t.capturedAt)],
);

/**
 * Log of weekly refresh runs, surfaced in /admin. Deliberately a pure log:
 * the cron resumes by querying for pops lacking a recent snapshot, not from a
 * stored cursor, so a run that dies mid-flight self-heals on the next invocation.
 */
export const cronRuns = sqliteTable('cron_runs', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => createId()),
  startedAt: text('started_at').notNull().$defaultFn(now),
  finishedAt: text('finished_at'),
  status: text('status', { enum: CRON_STATUSES }).notNull().default('running'),
  popsProcessed: integer('pops_processed').notNull().default(0),
  popsFailed: integer('pops_failed').notNull().default(0),
  notes: text('notes'),
});

export type Pop = InferSelectModel<typeof pops>;
export type NewPop = InferInsertModel<typeof pops>;
export type PriceSnapshot = InferSelectModel<typeof priceSnapshots>;
export type NewPriceSnapshot = InferInsertModel<typeof priceSnapshots>;
export type CronRun = InferSelectModel<typeof cronRuns>;

export type Variant = (typeof VARIANTS)[number];
export type Condition = (typeof CONDITIONS)[number];
export type BoxCondition = (typeof BOX_CONDITIONS)[number];
export type Status = (typeof STATUSES)[number];
export type AcquiredAs = (typeof ACQUIRED_AS)[number];
export type Source = (typeof SOURCES)[number];
export type MatchStatus = (typeof MATCH_STATUSES)[number];
