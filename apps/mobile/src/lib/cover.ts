import { coverUrl } from '@arpedia/core';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? '';

/**
 * Spec check 03-7, 05-7, 07-11: the real cover for a `cover_key` from any RPC, as `Cover`'s `uri`.
 * Undefined without a cover (or an api URL): `Cover` then draws the sample tone. The image is
 * cached on the phone by the platform image cache, so it shows offline once seen.
 */
export const coverUri = (coverKey: string | null | undefined): string | undefined =>
  coverUrl(API_URL, coverKey) ?? undefined;

/**
 * The cover of a revision, for lists that read `books.current_revision_id` but not its `cover_key`
 * (the Worker looks the key up by revision; a revision without a cover answers 404 and the sample
 * tone stays).
 */
export const revisionCoverUri = (revisionId: string | null | undefined): string | undefined =>
  revisionId ? coverUri(`src/${revisionId}/cover`) : undefined;
