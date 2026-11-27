import { AASA } from '@/lib/aasa';

// iOS universal links. Apple wants this file with no extension and JSON content.
export const dynamic = 'force-static';

export function GET() {
  return Response.json(AASA, { headers: { 'Content-Type': 'application/json' } });
}
