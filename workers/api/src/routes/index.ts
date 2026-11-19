// Route registry. Each flow adds exactly one line: [mount path, router from routes/<flow>/].
import type { Hono } from 'hono';
import type { AppEnv } from '../env';
import health from './00/health';
import avatars from './01/avatars';
import staffInvites from './01/staff-invites';
import staffSignIn from './01/staff-sign-in';
import books from './12/books';

export const routes: [path: string, router: Hono<AppEnv>][] = [
  ['/v1/health', health],
  ['/v1/avatars', avatars],
  ['/v1/staff-invites', staffInvites],
  ['/v1/staff-sign-in', staffSignIn],
  ['/v1/books', books],
];
