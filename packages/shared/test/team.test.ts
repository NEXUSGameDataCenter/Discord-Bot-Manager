import { describe, expect, it } from 'vitest';
import { hasRole, inviteSchema, meSchema, memberPatchSchema } from '../src';

describe('team roles', () => {
  it('ranks OWNER > ADMIN > EDITOR', () => {
    expect(hasRole('OWNER', 'ADMIN')).toBe(true);
    expect(hasRole('ADMIN', 'ADMIN')).toBe(true);
    expect(hasRole('EDITOR', 'ADMIN')).toBe(false);
    expect(hasRole('ADMIN', 'OWNER')).toBe(false);
  });
  it('normalises invite email and blocks inviting an OWNER', () => {
    const r = inviteSchema.safeParse({ email: '  Alice@Example.COM ', role: 'EDITOR' });
    expect(r.success && r.data.email).toBe('alice@example.com');
    expect(inviteSchema.safeParse({ email: 'a@b.co', role: 'OWNER' }).success).toBe(false);
    expect(inviteSchema.safeParse({ email: 'not-an-email', role: 'ADMIN' }).success).toBe(false);
  });
  it('validates profile and patches', () => {
    expect(meSchema.safeParse({ name: 'x'.repeat(41), avatarAssetId: null }).success).toBe(false);
    expect(meSchema.safeParse({ name: 'Watcharin', avatarAssetId: null }).success).toBe(true);
    expect(memberPatchSchema.safeParse({}).success).toBe(false);
    expect(memberPatchSchema.safeParse({ status: 'DISABLED' }).success).toBe(true);
  });
});

import { accessRequestSchema, changePasswordSchema } from '../src';
describe('access request', () => {
  it('requires name, valid email and an 8+ char password', () => {
    expect(accessRequestSchema.safeParse({ name: 'A', email: 'a@b.co', password: 'short' }).success).toBe(false);
    expect(accessRequestSchema.safeParse({ name: '', email: 'a@b.co', password: 'longenough' }).success).toBe(false);
    const ok = accessRequestSchema.safeParse({ name: ' Ann ', email: 'Ann@B.co', password: 'longenough' });
    expect(ok.success && ok.data.email).toBe('ann@b.co');
    expect(changePasswordSchema.safeParse({ next: '12345678' }).success).toBe(true);
  });
});
