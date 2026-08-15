import { describe, expect, it, vi } from 'vitest';
import { createPlaybackSlotPool } from './inViewPlayback';

describe('createPlaybackSlotPool', () => {
  it('grants every request up to capacity without revoking anyone', () => {
    const pool = createPlaybackSlotPool(3);
    const revokes = [vi.fn(), vi.fn(), vi.fn()];
    const keys = [{}, {}, {}];

    keys.forEach((key, i) => pool.request(key, revokes[i]));

    expect(keys.every((key) => pool.has(key))).toBe(true);
    expect(revokes.every((revoke) => revoke.mock.calls.length === 0)).toBe(true);
  });

  it('revokes the stalest holder when a request exceeds capacity', () => {
    const pool = createPlaybackSlotPool(2);
    const [a, b, c] = [{}, {}, {}];
    const revokeA = vi.fn();
    const revokeB = vi.fn();

    pool.request(a, revokeA);
    pool.request(b, revokeB);
    pool.request(c, vi.fn());

    expect(revokeA).toHaveBeenCalledTimes(1);
    expect(revokeB).not.toHaveBeenCalled();
    expect(pool.has(a)).toBe(false);
    expect(pool.has(b)).toBe(true);
    expect(pool.has(c)).toBe(true);
  });

  it('re-requesting refreshes recency, so someone else becomes the eviction victim', () => {
    const pool = createPlaybackSlotPool(2);
    const [a, b, c] = [{}, {}, {}];
    const revokeA = vi.fn();
    const revokeB = vi.fn();

    pool.request(a, revokeA);
    pool.request(b, revokeB);
    // The reader hovers tile A: its claim is now the freshest.
    pool.request(a, revokeA);
    pool.request(c, vi.fn());

    expect(revokeB).toHaveBeenCalledTimes(1);
    expect(revokeA).not.toHaveBeenCalled();
    expect(pool.has(a)).toBe(true);
    expect(pool.has(b)).toBe(false);
  });

  it('release frees the slot silently and lets a newcomer in without eviction', () => {
    const pool = createPlaybackSlotPool(1);
    const key = {};
    const revoke = vi.fn();

    pool.request(key, revoke);
    pool.release(key);

    expect(revoke).not.toHaveBeenCalled();
    expect(pool.has(key)).toBe(false);

    const next = {};
    const revokeNext = vi.fn();
    pool.request(next, revokeNext);
    expect(pool.has(next)).toBe(true);
    expect(revokeNext).not.toHaveBeenCalled();
  });

  it('releasing an unknown key is a no-op', () => {
    const pool = createPlaybackSlotPool(1);
    const held = {};
    pool.request(held, vi.fn());

    pool.release({});

    expect(pool.has(held)).toBe(true);
  });

  it('a revoked holder can reclaim a slot by re-requesting', () => {
    const pool = createPlaybackSlotPool(1);
    const [a, b] = [{}, {}];
    const revokeB = vi.fn();

    pool.request(a, vi.fn());
    pool.request(b, revokeB);
    expect(pool.has(a)).toBe(false);

    // Tile A comes back into view (or gets hovered) and requests again.
    pool.request(a, vi.fn());
    expect(revokeB).toHaveBeenCalledTimes(1);
    expect(pool.has(a)).toBe(true);
    expect(pool.has(b)).toBe(false);
  });
});
