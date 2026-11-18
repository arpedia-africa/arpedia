// Readiness score, routing and the fast lane (docs/prd/12-book-pipeline.md rules 24–26, 43).
// Postgres holds the authoritative copy (revision_score, _fast_lane_check in the flow 12
// migration); this one gives Studio and the admin the same numbers before a round trip.

export interface CheckRule {
  weight: number;
  blocking: boolean;
  /** Most this check can take off the score in total. */
  cap?: number;
}

export const DEFAULT_CHECKS: Record<string, CheckRule> = {
  file_check_error: { weight: 0, blocking: true },
  chapter_detection_failed: { weight: 0, blocking: true },
  plagiarism_high: { weight: 0, blocking: true },
  plagiarism_medium: { weight: 15, blocking: false },
  policy_hit: { weight: 0, blocking: true },
  policy_borderline: { weight: 10, blocking: false },
  too_short: { weight: 0, blocking: true },
  image_too_large: { weight: 5, blocking: false, cap: 15 },
  cover_too_small: { weight: 8, blocking: false },
  cover_aspect: { weight: 5, blocking: false },
  chapter_title: { weight: 4, blocking: false, cap: 12 },
  repeated_text: { weight: 10, blocking: false },
  copyright_missing: { weight: 6, blocking: false },
  toc_mismatch: { weight: 8, blocking: false },
  pdf_source: { weight: 10, blocking: false },
  low_structure_confidence: { weight: 10, blocking: false },
};

/** Score needed for Ready for review (Default Q50). */
export const READY_SCORE = 90;
/** Fast lane applies under this share of changed words, in percent (Default Q49). */
export const FAST_LANE_CHANGED_PCT = 2;

export interface OpenFlag {
  check_key: string;
}

const rule = (key: string, checks: Record<string, CheckRule>): CheckRule =>
  checks[key] ?? DEFAULT_CHECKS[key] ?? { weight: 0, blocking: false };

/** 100 minus the open flags' weights, each check capped, never below 0. */
export function readinessScore(open: OpenFlag[], checks = DEFAULT_CHECKS): number {
  const perCheck = new Map<string, number>();
  for (const f of open)
    perCheck.set(f.check_key, (perCheck.get(f.check_key) ?? 0) + rule(f.check_key, checks).weight);
  let off = 0;
  for (const [key, w] of perCheck) {
    const cap = rule(key, checks).cap;
    off += cap === undefined ? w : Math.min(w, cap);
  }
  return Math.max(0, 100 - off);
}

export const hasBlocking = (open: OpenFlag[], checks = DEFAULT_CHECKS) =>
  open.some((f) => rule(f.check_key, checks).blocking);

/** Where a submitted, sealed revision goes. */
export function route(open: OpenFlag[], checks = DEFAULT_CHECKS): 'ready_for_review' | 'needs_fixes' {
  return readinessScore(open, checks) >= READY_SCORE && !hasBlocking(open, checks)
    ? 'ready_for_review'
    : 'needs_fixes';
}

export interface RevisionDiff {
  insertedWords: number;
  deletedWords: number;
  baseWords: number;
  chaptersAdded: number;
  chaptersRemoved: number;
  coverChanged: boolean;
  metadataChanged: boolean;
}

/** changed_pct = (inserted + deleted) ÷ base words, in percent. */
export const changedPct = (d: Pick<RevisionDiff, 'insertedWords' | 'deletedWords' | 'baseWords'>) =>
  d.baseWords === 0 ? 100 : ((d.insertedWords + d.deletedWords) / d.baseWords) * 100;

export type FastLaneReason =
  | 'changed_pct'
  | 'chapters_changed'
  | 'cover_changed'
  | 'metadata_changed'
  | 'author_standing'
  | 'score'
  | 'blocking_flag';

/** Every reason the update cannot take the fast lane; empty means it can. Same order as SQL. */
export function fastLaneReasons(
  d: RevisionDiff,
  open: OpenFlag[],
  authorInGoodStanding: boolean,
  checks = DEFAULT_CHECKS,
): FastLaneReason[] {
  const out: FastLaneReason[] = [];
  if (changedPct(d) >= FAST_LANE_CHANGED_PCT) out.push('changed_pct');
  if (d.chaptersAdded > 0 || d.chaptersRemoved > 0) out.push('chapters_changed');
  if (d.coverChanged) out.push('cover_changed');
  if (d.metadataChanged) out.push('metadata_changed');
  if (!authorInGoodStanding) out.push('author_standing');
  if (readinessScore(open, checks) < READY_SCORE) out.push('score');
  if (hasBlocking(open, checks)) out.push('blocking_flag');
  return out;
}
