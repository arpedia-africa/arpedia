// Shared shapes, validated with zod. Database row types come from `supabase gen types`; these cover
// what travels between the phone, the Workers and R2 (manifest, chapters, ledger reasons).
import { z } from 'zod';

/** Every reason a credit can move. Mirrors the `ledger_reason` Postgres enum. */
export const LedgerReason = z.enum([
  'plan_grant',
  'rollover',
  'top_up',
  'unlock_all',
  'chapter',
  'undo',
  'tip',
  'message',
  'expiry',
  'refund',
  'staff_adjust',
  'gift_out',
  'gift_in',
  'promo',
]);
export type LedgerReason = z.infer<typeof LedgerReason>;

export const LedgerBucket = z.enum(['plan', 'rollover', 'topup', 'promo']);
export type LedgerBucket = z.infer<typeof LedgerBucket>;

export const StaffRole = z.enum([
  'super_admin',
  'operations_admin',
  'publisher',
  'moderator',
  'finance',
  'support',
  'analyst',
]);
export type StaffRole = z.infer<typeof StaffRole>;

export const Theme = z.enum(['sunflower', 'palm', 'plum', 'night']);
export type Theme = z.infer<typeof Theme>;

export const Paragraph = z.object({
  id: z.string().regex(/^p_[a-z2-7]{10}$/),
  words_before: z.number().int().nonnegative(),
});

export const ManifestChapter = z.object({
  chapter_uid: z.uuid(),
  ord: z.number().int().nonnegative(),
  kind: z.enum(['chapter', 'part']),
  parent_ord: z.number().int().nonnegative().nullable(),
  title: z.string().min(1),
  words: z.number().int().nonnegative(),
  words_before: z.number().int().nonnegative(),
  pages: z.number().nonnegative(),
  price_credits: z.number().int().nonnegative(),
  free_file: z.string().nullable(),
  full_file: z.string(),
  images: z.number().int().nonnegative().default(0),
  paragraphs: z.array(Paragraph),
});
export type ManifestChapter = z.infer<typeof ManifestChapter>;

export const BookManifest = z
  .object({
    schema_version: z.literal(1),
    book_id: z.uuid(),
    revision_id: z.uuid(),
    total_words: z.number().int().nonnegative(),
    pages: z.number().int().nonnegative(),
    price_credits: z.number().int().positive(),
    preview_cut: z.object({
      chapter_uid: z.uuid(),
      para_id: z.string(),
      percent: z.number().min(0).max(25),
    }),
    cipher: z.object({ alg: z.literal('AES-GCM'), key_bits: z.literal(256) }),
    chapters: z.array(ManifestChapter).min(1),
  })
  .refine(m => m.chapters.reduce((a, c) => a + c.price_credits, 0) === m.price_credits, {
    message: 'chapter prices must sum to the book price',
    path: ['chapters'],
  });
export type BookManifest = z.infer<typeof BookManifest>;
