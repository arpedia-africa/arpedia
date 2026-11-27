import { describe, expect, it } from 'vitest';
import { soleSuperAdminTask } from './home-tasks';

describe('soleSuperAdminTask (flow 16 open question 4)', () => {
  it('asks for a second Super admin while there is one', () => {
    expect(soleSuperAdminTask(['Amaka Obi'])).toMatchObject({ href: '/team', title: 'Add a second Super admin' });
  });
  it('says nothing once there are two, or when the list is unknown', () => {
    expect(soleSuperAdminTask(['Amaka Obi', 'Tunde Bello'])).toBeNull();
    expect(soleSuperAdminTask([])).toBeNull();
  });
});
