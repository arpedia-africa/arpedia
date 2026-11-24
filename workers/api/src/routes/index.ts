// Route registry. Each flow adds exactly one line: [mount path, router from routes/<flow>/].
import type { Hono } from 'hono';
import type { AppEnv } from '../env';
import health from './00/health';
import avatars from './01/avatars';
import staffInvites from './01/staff-invites';
import staffSignIn from './01/staff-sign-in';
import rooms from './07/rooms';
import account from './10/account';
import reading from './04/reading';
import authorApplications from './11/applications';
import books from './12/books';
import trust from './14/trust';
import payments from './09/payments';
import appConfig from './16/app-config';
import authors from './08/authors';
import earnings from './13/earnings';
import engage from './15/engage';
import emailVerify from './15/email-verify';
import storeEvents from './17/store-events';

export const routes: [path: string, router: Hono<AppEnv>][] = [
  ['/v1/health', health],
  ['/v1/avatars', avatars],
  ['/v1/staff-invites', staffInvites],
  ['/v1/staff-sign-in', staffSignIn],
  ['/v1/rooms', rooms],
  ['/v1/author-applications', authorApplications],
  ['/v1/books', books],
  ['/v1/trust', trust],
  ['/v1/account', account],
  // Before flow 09's webhook: products we don't sell (v25) are recorded, never applied.
  ['/v1/payments', storeEvents],
  ['/v1/payments', payments],
  ['/v1/reader', reading],
  ['/v1/app-config', appConfig],
  ['/v1/authors', authors],
  ['/v1/earnings', earnings],
  ['/v1/engage', engage],
  ['/v1/email-verify', emailVerify],
];
