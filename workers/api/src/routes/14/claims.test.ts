import { beforeEach, describe, expect, it, vi } from 'vitest';

// Spec check 14-21: copyright claims by email, and the matching-passages check. The SQL side
// (book lookup, dedupe, timeline line) is pgTAP 14_claim_intake_test.sql.
let claimResult: unknown = { claim: 'CLM-0500', id: 'c1', book_id: 'b1' };
let queue: unknown[] = [];
const rpc = vi.fn(async (fn: string, _args?: Record<string, unknown>) => {
  if (fn === 'ingest_claim_email') return { data: claimResult, error: null };
  if (fn === 'ingest_support_email') return { data: { ticket: 'SUP-1' }, error: null };
  if (fn === 'claims_needing_similarity') return { data: queue, error: null };
  if (fn === 'set_claim_similarity') return { data: true, error: null };
  throw new Error(`unexpected rpc ${fn}`);
});
vi.mock('../../db', () => ({ serviceDb: () => ({ rpc }) }));

const { default: trust } = await import('./trust');
const { checkClaimSimilarity, evidenceOf, plainText, sizeLabel } = await import('./claims');

const SECRET = 'whsec_' + btoa('test-secret-key-123');
const store = new Map<string, { body: string; type?: string }>();
const BOOKS = {
  put: vi.fn(async (key: string, bytes: Uint8Array, o?: { httpMetadata?: { contentType?: string } }) => {
    store.set(key, { body: new TextDecoder().decode(bytes), type: o?.httpMetadata?.contentType });
  }),
  get: vi.fn(async (key: string) => {
    const o = store.get(key);
    if (!o) return null;
    return {
      size: o.body.length,
      text: async () => o.body,
      json: async () => JSON.parse(o.body) as unknown,
    };
  }),
};
const env = {
  SUPABASE_SERVICE_ROLE_KEY: 'svc',
  SUPABASE_URL: 'http://db',
  APP_ENV: 'local',
  RESEND_WEBHOOK_SECRET: SECRET,
  BOOKS,
};

async function sign(id: string, ts: string, body: string) {
  const raw = Uint8Array.from(atob(SECRET.slice(6)), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${body}`));
  return `v1,${btoa(String.fromCharCode(...new Uint8Array(mac)))}`;
}

async function inbound(data: Record<string, unknown>) {
  const body = JSON.stringify({ type: 'email.received', data });
  const ts = String(Math.floor(Date.now() / 1000));
  return trust.request(
    '/support/inbound',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'svix-id': 'msg_1',
        'svix-timestamp': ts,
        'svix-signature': await sign('msg_1', ts, body),
      },
      body,
    },
    env,
  );
}

const callOf = (fn: string) => rpc.mock.calls.find(([f]) => f === fn)?.[1];

beforeEach(() => {
  rpc.mockClear();
  store.clear();
  claimResult = { claim: 'CLM-0500', id: 'c1', book_id: 'b1' };
  queue = [];
});

describe('POST /support/inbound: mail to copyright@', () => {
  const mail = {
    from: '"Barr. Yetunde Coker" <Legal@Paramount.ng>',
    to: ['Copyright <copyright@arpedia.africa>'],
    subject: 'Plagiarism: Kano Nights',
    text: 'Kano Nights copies our novel.',
    message_id: '<m1@paramount.ng>',
    attachments: [{ filename: 'proof 2019.pdf', content: btoa('%PDF-1.4'), content_type: 'application/pdf' }],
  };

  it('opens a claim with the sender, type and evidence', async () => {
    const res = await inbound(mail);
    expect(await res.json()).toEqual(claimResult);
    const args = callOf('ingest_claim_email')!;
    expect(args).toMatchObject({
      p_from: 'legal@paramount.ng',
      p_name: 'Barr. Yetunde Coker',
      p_subject: 'Plagiarism: Kano Nights',
      p_body: 'Kano Nights copies our novel.',
      p_message_id: '<m1@paramount.ng>',
      p_type: 'plagiarism',
    });
    const [file] = args.p_attachments as { key: string; name: string; kind: string; size: string }[];
    expect(file).toMatchObject({ name: 'proof_2019.pdf', kind: 'PDF', size: '1 KB' });
    expect(file!.key).toMatch(/^claims\/[0-9a-f-]{36}\/proof_2019\.pdf$/);
    expect(callOf('ingest_support_email')).toBeUndefined();
  });

  it('files mail that names no book as a support ticket', async () => {
    claimResult = { routed: 'ticket' };
    const res = await inbound(mail);
    expect(await res.json()).toEqual({ ticket: 'SUP-1' });
    const ticket = callOf('ingest_support_email')!;
    expect(ticket).toMatchObject({ p_from: 'legal@paramount.ng', p_subject: 'Plagiarism: Kano Nights' });
    // The ticket keeps the same shape of attachment as before.
    expect(Object.keys((ticket.p_attachments as object[])[0]!)).toEqual(['key', 'name', 'type']);
  });

  it('leaves mail to other addresses to the support inbox', async () => {
    await inbound({ ...mail, to: 'support@arpedia.africa', cc: ['someone@x.ng'] });
    expect(callOf('ingest_claim_email')).toBeUndefined();
    const ticket = callOf('ingest_support_email')!;
    expect((ticket.p_attachments as { key: string }[])[0]!.key).toMatch(/^support\//);
  });

  it('reads the copyright address from cc too', async () => {
    await inbound({ ...mail, to: 'support@arpedia.africa', cc: 'copyright@arpedia.africa' });
    expect(callOf('ingest_claim_email')).toBeDefined();
  });
});

describe('checkClaimSimilarity (cron)', () => {
  const work = {
    chapters: [
      {
        title: 'Chapter 1',
        blocks: [{ text: 'A quiet morning in the city of Kano with nothing at all.', html: '' }],
      },
      {
        title: 'Chapter 3',
        blocks: [
          { text: '* * *', html: '', sceneBreak: true },
          { text: 'The harmattan dust sat on the windowsill like a debt nobody wanted to name.', html: '' },
        ],
      },
    ],
  };

  it('compares the claim and its text evidence with the working copy', async () => {
    store.set('work/r1/v2/book.json', { body: JSON.stringify(work) });
    store.set('claims/x/source.txt', {
      body: '"The harmattan dust sat on the windowsill like a debt nobody wanted"',
    });
    queue = [
      {
        id: 'c1',
        details: 'Please take this down.',
        evidence: [{ key: 'claims/x/source.txt', name: 'source.txt', type: 'text/plain' }],
        revision_id: 'r1',
        work_version: 2,
      },
    ];
    expect(await checkClaimSimilarity(env as never)).toEqual({ checked: 1 });
    const set = callOf('set_claim_similarity')!;
    expect(set.p_claim).toBe('c1');
    expect(set.p_similarity).toMatchObject({ flagged: 1, chapter: 'Chapter 3', score: 100 });
  });

  it('never reads evidence outside claims/ or that is not plain text', async () => {
    store.set('work/r1/v2/book.json', { body: JSON.stringify(work) });
    store.set('support/y/source.txt', {
      body: '"The harmattan dust sat on the windowsill like a debt nobody wanted"',
    });
    queue = [
      {
        id: 'c1',
        details: null,
        evidence: [
          { key: 'support/y/source.txt', type: 'text/plain' },
          { key: 'claims/y/a.pdf', type: 'application/pdf' },
        ],
        revision_id: 'r1',
        work_version: 2,
      },
    ];
    await checkClaimSimilarity(env as never);
    expect(callOf('set_claim_similarity')!.p_similarity).toMatchObject({ checked: 0, flagged: 0 });
    expect(BOOKS.get).not.toHaveBeenCalledWith('support/y/source.txt');
  });

  it('records a failed check when the book has no working copy', async () => {
    queue = [{ id: 'c2', details: 'x', evidence: [], revision_id: null, work_version: null }];
    await checkClaimSimilarity(env as never);
    expect(callOf('set_claim_similarity')).toEqual({
      p_claim: 'c2',
      p_similarity: { failed: true, reason: 'no_text' },
    });
  });
});

describe('plainText', () => {
  it('turns an HTML-only body into text', () => {
    expect(
      plainText(
        '<style>p{}</style><p>Our text: &quot;The dust&nbsp;sat&quot;</p><p>Kind &amp; true<br>Yetunde</p>',
      ),
    ).toBe('Our text: "The dust sat"\n\nKind & true\nYetunde');
  });
});

describe('evidence labels', () => {
  it('names the kind and size', () => {
    expect(sizeLabel(3.8 * 1024 * 1024)).toBe('3.8 MB');
    expect(sizeLabel(640 * 1024)).toBe('640 KB');
    expect(sizeLabel(10)).toBe('1 KB');
    expect(evidenceOf({ key: 'k', name: 'a.png', type: 'image/png', bytes: 2048 })).toMatchObject({
      kind: 'Image',
      size: '2 KB',
    });
    expect(evidenceOf({ key: 'k', name: 'a.bin', type: 'application/zip', bytes: 2048 }).kind).toBe('File');
  });
});
