// Flow 15 · export-builder (Server, rule 29). Reads pgmq export_jobs, pages export_rows() into a
// CSV in R2 (exports/<id>/…), sets the status, and deletes expired files daily. Downloads go
// through export_download_key(), which checks creator or Super admin, two-step and expiry, and
// writes audit_log.
import { csvRow } from '@arpedia/core';
import { serviceDb } from '../../db';
import type { Env } from '../../env';

type Db = ReturnType<typeof serviceDb>;
const PAGE = 1000;

export const exportFileName = (kind: string, createdAt: string) =>
  `${kind.replace(/_/g, '-')}-${createdAt.slice(0, 10)}.csv`;

export async function buildExport(env: Env, db: Db, id: string): Promise<void> {
  const { data: job, error } = await db.rpc('export_job', { p_id: id });
  if (error) throw error;
  const e = job as unknown as {
    id: string;
    kind: string;
    columns: string[];
    status: string;
    created_at: string;
  } | null;
  if (!e || e.status !== 'counting') return;
  await db.rpc('set_export_status', { p_id: id, p_status: 'building' });
  const parts: string[] = [];
  let header: string[] | null = e.columns.length ? e.columns : null;
  let count = 0;
  try {
    for (let offset = 0; ; offset += PAGE) {
      const { data, error: re } = await db.rpc('export_rows', { p_id: id, p_offset: offset, p_limit: PAGE });
      if (re) throw re;
      const rows = data as unknown as Record<string, unknown>[];
      if (!header && rows[0]) header = Object.keys(rows[0]).sort();
      // Personal columns the creator wasn't allowed come back missing: keep them out of the header.
      if (rows[0] && header) header = header.filter((k) => k in rows[0]!);
      for (const r of rows) parts.push(csvRow(header!.map((k) => r[k])));
      count += rows.length;
      if (rows.length < PAGE) break;
    }
  } catch (err) {
    const msg = (err as { message?: string }).message ?? 'Export failed';
    await db.rpc('set_export_status', { p_id: id, p_status: 'failed', p_error: msg.slice(0, 300) });
    return;
  }
  const key = `exports/${id}/${exportFileName(e.kind, e.created_at)}`;
  await env.BOOKS.put(key, [csvRow(header ?? []), ...parts].join(''), {
    httpMetadata: { contentType: 'text/csv; charset=utf-8' },
  });
  const { error: se } = await db.rpc('set_export_status', {
    p_id: id,
    p_status: 'ready',
    p_row_count: count,
    p_file_key: key,
  });
  if (se) throw se;
  // TODO(flow 16): staff bell alert "Your export is ready" once the staff bell exists.
}

export async function buildExports(env: Env): Promise<void> {
  const db = serviceDb(env);
  const { data, error } = await db.rpc('engage_queue_read', { p_queue: 'export_jobs', p_vt: 600, p_qty: 2 });
  if (error) throw error;
  for (const m of (data ?? []) as unknown as {
    msg_id: number;
    read_ct: number;
    message: { export_id: string };
  }[]) {
    try {
      if (m.read_ct > 3)
        await db.rpc('set_export_status', {
          p_id: m.message.export_id,
          p_status: 'failed',
          p_error: 'worker_failed',
        });
      else await buildExport(env, db, m.message.export_id);
      await db.rpc('engage_queue_done', { p_queue: 'export_jobs', p_msg_id: m.msg_id });
    } catch (e) {
      console.error('export failed', m.message.export_id, e);
    }
  }
}

/** Daily: files older than 7 days are deleted (NDPA 2023). */
export async function expireExports(env: Env): Promise<void> {
  const db = serviceDb(env);
  const { data, error } = await db.rpc('expire_exports');
  if (error) throw error;
  if (data.length) await env.BOOKS.delete(data);
}
