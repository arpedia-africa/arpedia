// Route registry. Each flow adds exactly one line: [mount path, router from routes/<flow>/].
import type { Hono } from 'hono';
import type { AppEnv } from '../env';
import health from './00/health';
import avatars from './01/avatars';

export const routes: [path: string, router: Hono<AppEnv>][] = [
  ['/v1/health', health],
  ['/v1/avatars', avatars],
];
