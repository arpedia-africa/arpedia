import { describe, expect, it } from 'vitest';
import { previewHref, previewRoleOf, PREVIEW_ROLES } from './preview-as';

// Spec check 16-25: only a Super admin can preview, and only the roles the switch offers.
describe('previewRoleOf', () => {
  it('reads the previewed role for a Super admin', () => {
    for (const r of PREVIEW_ROLES) expect(previewRoleOf('super_admin', r)).toBe(r);
  });

  it('ignores the cookie for every other role', () => {
    expect(previewRoleOf('finance', 'publisher')).toBeNull();
    expect(previewRoleOf('operations_admin', 'moderator')).toBeNull();
    expect(previewRoleOf(undefined, 'publisher')).toBeNull();
  });

  it('ignores no cookie, super_admin itself and anything unknown', () => {
    expect(previewRoleOf('super_admin', undefined)).toBeNull();
    expect(previewRoleOf('super_admin', 'super_admin')).toBeNull();
    expect(previewRoleOf('super_admin', 'support')).toBeNull();
    expect(previewRoleOf('super_admin', 'publisher; path=/')).toBeNull();
  });
});

describe('previewHref', () => {
  it('links to the preview route', () => {
    expect(previewHref('publisher')).toBe('/preview-as?role=publisher');
    expect(previewHref('super_admin')).toBe('/preview-as?role=super_admin');
  });
});
