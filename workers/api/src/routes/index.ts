// Route registry. Each flow adds exactly one line: [mount path, router from routes/<flow>/].
import type { Hono } from 'hono';
import type { AppEnv } from '../env';
import health from './00/health';

export const routes: [path: string, router: Hono<AppEnv>][] = [
  ['/v1/health', health],
];
