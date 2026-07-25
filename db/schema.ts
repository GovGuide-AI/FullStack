import {
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import type { Locale } from '@/lib/locales';
import type { ReviewDetails } from '@/lib/reviews/schema';

/**
 * Runtime data only.
 *
 * No government knowledge is stored here — that lives in `knowledge/*.yaml`.
 * If this database were dropped entirely, the app would lose user history and
 * nothing else.
 */

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey(),
  locale: varchar('locale', { length: 8 }).$type<Locale>().notNull().default('en'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
});

export type MessageRole = 'user' | 'assistant';
export type AskOutcome = 'answer' | 'clarify' | 'not-covered';

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 16 }).$type<MessageRole>().notNull(),
    content: text('content').notNull(),
    /** Not a foreign key: services live in YAML, not in this database. */
    serviceSlug: varchar('service_slug', { length: 64 }),
    outcome: varchar('outcome', { length: 24 }).$type<AskOutcome>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('messages_session_created_idx').on(table.sessionId, table.createdAt)],
);

export const savedChecklists = pgTable(
  'saved_checklists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    serviceSlug: varchar('service_slug', { length: 64 }).notNull(),
    /** Citation-style ids of ticked items, e.g. `documents.0`. */
    checkedItemIds: jsonb('checked_item_ids').$type<string[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('saved_checklists_session_service_key').on(table.sessionId, table.serviceSlug),
  ],
);

export const feedback = pgTable(
  'feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    serviceSlug: varchar('service_slug', { length: 64 }),
    /** -1 unhelpful, 1 helpful. */
    rating: smallint('rating').notNull(),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('feedback_service_idx').on(table.serviceSlug)],
);

export type AiCacheKind = 'route' | 'explain';

export const aiCache = pgTable(
  'ai_cache',
  {
    /**
     * SHA-256 of the question, locale, model, and a hash of the knowledge
     * record. Including the record hash means editing a YAML file invalidates
     * every cached answer derived from it, so a corrected fee cannot be served
     * from cache.
     */
    key: varchar('key', { length: 64 }).primaryKey(),
    kind: varchar('kind', { length: 16 }).$type<AiCacheKind>().notNull(),
    model: text('model').notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('ai_cache_expires_idx').on(table.expiresAt)],
);

export type ReviewStatus = 'published' | 'hidden';

/**
 * Citizen-submitted reports, kept strictly apart from the verified knowledge
 * base: nothing in this table is ever assembled into a prompt or presented as
 * an official fact.
 */
export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * Nulled rather than cascaded: deleting a visitor should anonymise their
     * report, not erase what the community has contributed.
     */
    sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'set null' }),
    /** Not a foreign key: services live in YAML, not in this database. */
    serviceSlug: varchar('service_slug', { length: 64 }).notNull(),
    /** The language the author wrote in. Their words are never translated. */
    locale: varchar('locale', { length: 8 }).$type<Locale>().notNull(),
    body: text('body').notNull(),
    details: jsonb('details').$type<ReviewDetails>().notNull().default({}),
    status: varchar('status', { length: 16 }).$type<ReviewStatus>().notNull().default('published'),
    /** Denormalised for cheap reads; `review_flags` is what keeps it honest. */
    flagCount: smallint('flag_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Column order matches the only read query — published reports for one
    // service, newest first — so it is answered from the index alone.
    index('reviews_service_status_idx').on(table.serviceSlug, table.status, table.createdAt),
  ],
);

export const reviewFlags = pgTable(
  'review_flags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // One visitor cannot flag the same report twice, which is what stops a single
  // objector from hiding a report on their own.
  (table) => [uniqueIndex('review_flags_review_session_key').on(table.reviewId, table.sessionId)],
);

export type SessionRow = typeof sessions.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type SavedChecklistRow = typeof savedChecklists.$inferSelect;
export type FeedbackRow = typeof feedback.$inferSelect;
export type AiCacheRow = typeof aiCache.$inferSelect;
export type ReviewRow = typeof reviews.$inferSelect;
export type ReviewFlagRow = typeof reviewFlags.$inferSelect;
