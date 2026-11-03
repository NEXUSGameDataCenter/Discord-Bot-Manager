import { describe, expect, it } from 'vitest';
import {
  renderMemberTemplate,
  autoRolesFor,
  resolveRoleMenu,
  parseDuration,
  hierarchyBlock,
  honeypotTriggers,
  guildSettingsSchema,
  roleMenuSchema,
  inviteBitfield,
} from '../src';

const m = { userId: '111111111111111111', username: 'alice', displayName: 'Alice', serverName: 'TOSM', memberCount: 1234 };

describe('welcome templates', () => {
  it('renders member variables', () => {
    expect(renderMemberTemplate('Hi {user.mention} ({user.name}) to {server.name} #{memberCount}', m)).toBe('Hi <@111111111111111111> (Alice) to TOSM #1,234');
  });
  it('does not re-scan injected names', () => {
    expect(renderMemberTemplate('{user}', { ...m, displayName: '{server.name}' })).toBe('{server.name}');
  });
  it('filters auto roles by member type', () => {
    const roles = [
      { roleId: '1'.repeat(18), target: 'human' as const, delaySec: 0 },
      { roleId: '2'.repeat(18), target: 'bot' as const, delaySec: 0 },
      { roleId: '3'.repeat(18), target: 'all' as const, delaySec: 60 },
    ];
    expect(autoRolesFor(roles, false).map((r) => r.roleId[0])).toEqual(['1', '3']);
    expect(autoRolesFor(roles, true).map((r) => r.roleId[0])).toEqual(['2', '3']);
  });
});

describe('reaction role modes', () => {
  const menu = ['A', 'B', 'C'];
  it('TOGGLE: button adds then removes', () => {
    expect(resolveRoleMenu('TOGGLE', menu, [], 'A')).toEqual({ add: ['A'], remove: [] });
    expect(resolveRoleMenu('TOGGLE', menu, ['A'], 'A')).toEqual({ add: [], remove: ['A'] });
  });
  it('TOGGLE: reaction add/remove', () => {
    expect(resolveRoleMenu('TOGGLE', menu, [], 'A', true)).toEqual({ add: ['A'], remove: [] });
    expect(resolveRoleMenu('TOGGLE', menu, ['A'], 'A', false)).toEqual({ add: [], remove: ['A'] });
  });
  it('UNIQUE: swaps to the new role', () => {
    expect(resolveRoleMenu('UNIQUE', menu, ['A', 'X'], 'B')).toEqual({ add: ['B'], remove: ['A'] });
  });
  it('ADD_ONLY never removes', () => {
    expect(resolveRoleMenu('ADD_ONLY', menu, ['A'], 'A')).toEqual({ add: [], remove: [] });
    expect(resolveRoleMenu('ADD_ONLY', menu, ['A'], 'A', false)).toEqual({ add: [], remove: [] });
  });
  it('REMOVE_ONLY never adds', () => {
    expect(resolveRoleMenu('REMOVE_ONLY', menu, [], 'A')).toEqual({ add: [], remove: [] });
    expect(resolveRoleMenu('REMOVE_ONLY', menu, ['A'], 'A')).toEqual({ add: [], remove: ['A'] });
  });
});

describe('moderation helpers', () => {
  it('parses durations', () => {
    expect(parseDuration('10m')).toBe(600);
    expect(parseDuration('1h30m')).toBe(5400);
    expect(parseDuration('2d')).toBe(172800);
    expect(parseDuration('abc')).toBe(null);
    expect(parseDuration('0m')).toBe(null);
  });
  const base = { actorId: 'mod', actorTop: 10, botTop: 20, targetId: 'u', targetTop: 5, ownerId: 'owner' };
  it('allows acting on lower members', () => {
    expect(hierarchyBlock(base)).toBe(null);
  });
  it('blocks owner, self, equal/higher roles, and roles above the bot', () => {
    expect(hierarchyBlock({ ...base, targetId: 'owner' })).toMatch(/เจ้าของ/);
    expect(hierarchyBlock({ ...base, targetId: 'mod' })).toMatch(/ตัวเอง/);
    expect(hierarchyBlock({ ...base, targetTop: 10 })).toMatch(/ของคุณ/);
    expect(hierarchyBlock({ ...base, actorId: 'owner', targetTop: 25 })).toMatch(/Bot/);
  });
  const hp = { enabled: true, honeypotChannelId: 'H', channelId: 'H', authorIsBot: false, authorIsOwner: false, authorIsAdmin: false, authorRoleIds: ['r1'], exemptRoleIds: ['mod'] };
  it('honeypot triggers only for normal members in the trap channel', () => {
    expect(honeypotTriggers(hp)).toBe(true);
    expect(honeypotTriggers({ ...hp, channelId: 'X' })).toBe(false);
    expect(honeypotTriggers({ ...hp, enabled: false })).toBe(false);
    expect(honeypotTriggers({ ...hp, authorIsAdmin: true })).toBe(false);
    expect(honeypotTriggers({ ...hp, authorIsBot: true })).toBe(false);
    expect(honeypotTriggers({ ...hp, authorRoleIds: ['mod'] })).toBe(false);
  });
});

describe('module schemas', () => {
  const settings = {
    welcomeEnabled: false, welcomeChannelId: null, welcomeMessage: 'hi', welcomeDmEnabled: false, welcomeDmMessage: '',
    goodbyeEnabled: false, goodbyeChannelId: null, goodbyeMessage: '', autoRoles: [], modLogChannelId: null, reasonPresets: [],
    honeypotEnabled: false, honeypotChannelId: null, honeypotAction: 'alert', honeypotExemptRoleIds: [],
  };
  it('requires channels when modules are enabled', () => {
    expect(guildSettingsSchema.safeParse(settings).success).toBe(true);
    expect(guildSettingsSchema.safeParse({ ...settings, welcomeEnabled: true }).success).toBe(false);
    expect(guildSettingsSchema.safeParse({ ...settings, honeypotEnabled: true }).success).toBe(false);
  });
  it('honeypot channel must be its own channel', () => {
    const ch = '123456789012345678';
    expect(guildSettingsSchema.safeParse({ ...settings, honeypotChannelId: ch, modLogChannelId: ch }).success).toBe(false);
  });
  const menu = { guildRefId: 'g', channelId: '123456789012345678', title: 'Roles', type: 'REACTION', mode: 'TOGGLE', options: [{ roleId: '123456789012345671', label: 'A' }] };
  it('reaction menus need an emoji per option', () => {
    expect(roleMenuSchema.safeParse(menu).success).toBe(false);
    expect(roleMenuSchema.safeParse({ ...menu, options: [{ ...menu.options[0], emoji: '🔥' }] }).success).toBe(true);
    expect(roleMenuSchema.safeParse({ ...menu, type: 'BUTTON' }).success).toBe(true);
  });
  it('invite includes the moderation + role permissions', () => {
    expect(inviteBitfield()).toBe(1100384234582n);
  });
});
