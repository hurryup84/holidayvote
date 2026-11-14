import { describe, expect, it } from 'vitest';
import { inviteCodeFromUrl, inviteUrl } from '../../src/core/inviteLink';

describe('invite links', () => {
  it('reads the code from every link form', () => {
    expect(inviteCodeFromUrl('com.moidev.holidayvote://join/k7p2qx')).toBe('K7P2QX');
    expect(inviteCodeFromUrl('https://holidayvote.support-moidev.workers.dev/join/K7P2QX')).toBe('K7P2QX');
    expect(inviteCodeFromUrl('https://holidayvote.support-moidev.workers.dev/join?c=K7P2QX')).toBe('K7P2QX');
    expect(inviteCodeFromUrl('/join.html?code=K7P2QX')).toBe('K7P2QX');
    expect(inviteCodeFromUrl(inviteUrl('ABC234'))).toBe('ABC234');
    expect(inviteUrl('ABC234')).toBe('https://holidayvote.support-moidev.workers.dev/join?c=ABC234');
  });
  it('ignores other links', () => {
    expect(inviteCodeFromUrl('https://example.com/joinus/K7P2QX')).toBeNull();
    expect(inviteCodeFromUrl('com.moidev.holidayvote://join/K7P2QX9')).toBeNull();
    expect(inviteCodeFromUrl(null)).toBeNull();
  });
});
