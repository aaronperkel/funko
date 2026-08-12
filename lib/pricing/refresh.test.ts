import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STALE_AFTER_DAYS,
  parseMatchCandidates,
  parseSnapshotSample,
  selectPopsToRefresh,
  type RefreshCandidate,
} from '@/lib/pricing/refresh';

const NOW = new Date('2026-08-12T12:00:00.000Z');

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function candidate(overrides: Partial<RefreshCandidate> = {}): RefreshCandidate {
  return {
    id: 'p1',
    name: 'Mo',
    status: 'owned',
    matchStatus: 'matched_upc',
    upc: '889698371735',
    priceChartingId: '6910',
    lastPricedAt: null,
    ...overrides,
  };
}

describe('selectPopsToRefresh', () => {
  it('picks up figures that have never been priced', () => {
    const due = selectPopsToRefresh([candidate({ lastPricedAt: null })], { now: NOW });
    expect(due).toHaveLength(1);
  });

  it('leaves alone anything priced within the staleness window', () => {
    const fresh = candidate({ lastPricedAt: daysAgo(DEFAULT_STALE_AFTER_DAYS - 1) });
    expect(selectPopsToRefresh([fresh], { now: NOW })).toHaveLength(0);
  });

  it('picks up anything priced longer ago than that', () => {
    const stale = candidate({ lastPricedAt: daysAgo(DEFAULT_STALE_AFTER_DAYS + 1) });
    expect(selectPopsToRefresh([stale], { now: NOW })).toHaveLength(1);
  });

  it('re-prices a fresh figure anyway when explicitly forced', () => {
    const fresh = candidate({ lastPricedAt: daysAgo(1) });
    expect(selectPopsToRefresh([fresh], { now: NOW, force: true })).toHaveLength(1);
  });

  it('never spends a call on a figure that has been sold', () => {
    const sold = candidate({ status: 'sold', lastPricedAt: null });
    expect(selectPopsToRefresh([sold], { now: NOW })).toHaveLength(0);
  });

  it('prices wishlist figures, which is the whole point of a wishlist', () => {
    const wanted = candidate({ status: 'wishlist', lastPricedAt: null });
    expect(selectPopsToRefresh([wanted], { now: NOW })).toHaveLength(1);
  });

  it('does not re-run a search that already produced a review queue entry', () => {
    const queued = candidate({
      matchStatus: 'pending_review',
      upc: null,
      priceChartingId: null,
    });
    expect(selectPopsToRefresh([queued], { now: NOW })).toHaveLength(0);
  });

  it('leaves rejected matches alone rather than re-queueing the same wrong candidates', () => {
    const rejected = candidate({ matchStatus: 'rejected', upc: null, priceChartingId: null });
    expect(selectPopsToRefresh([rejected], { now: NOW })).toHaveLength(0);
  });

  it('brings a queued figure straight back once it gains a UPC', () => {
    const identified = candidate({
      matchStatus: 'pending_review',
      upc: '889698371735',
      priceChartingId: null,
    });
    expect(selectPopsToRefresh([identified], { now: NOW })).toHaveLength(1);
  });

  it('serves never-priced figures before merely stale ones', () => {
    const due = selectPopsToRefresh(
      [
        candidate({ id: 'stale', lastPricedAt: daysAgo(90) }),
        candidate({ id: 'never', lastPricedAt: null }),
      ],
      { now: NOW },
    );
    expect(due.map((entry) => entry.id)).toEqual(['never', 'stale']);
  });

  it('orders stale figures oldest first, so a truncated run still makes progress', () => {
    const due = selectPopsToRefresh(
      [
        candidate({ id: 'recent', lastPricedAt: daysAgo(7) }),
        candidate({ id: 'ancient', lastPricedAt: daysAgo(400) }),
        candidate({ id: 'middling', lastPricedAt: daysAgo(30) }),
      ],
      { now: NOW },
    );
    expect(due.map((entry) => entry.id)).toEqual(['ancient', 'middling', 'recent']);
  });

  it('caps a run at the limit', () => {
    const many = Array.from({ length: 50 }, (_, index) =>
      candidate({ id: `p${index}`, name: `Figure ${index}` }),
    );
    expect(selectPopsToRefresh(many, { now: NOW, limit: 10 })).toHaveLength(10);
  });

  it('honours an explicit id list while still applying the rules', () => {
    const due = selectPopsToRefresh(
      [candidate({ id: 'wanted' }), candidate({ id: 'other' }), candidate({ id: 'gone', status: 'sold' })],
      { now: NOW, ids: ['wanted', 'gone'] },
    );
    expect(due.map((entry) => entry.id)).toEqual(['wanted']);
  });
});

describe('parseMatchCandidates', () => {
  it('reads back what a search stored', () => {
    const json = JSON.stringify([{ id: '6910', name: 'Mo', console: 'Funko Pop Movies' }]);
    expect(parseMatchCandidates(json)).toEqual([
      { id: '6910', name: 'Mo', console: 'Funko Pop Movies' },
    ]);
  });

  it('treats a corrupt column as empty rather than throwing in a page render', () => {
    expect(parseMatchCandidates('not json')).toEqual([]);
    expect(parseMatchCandidates('{"not":"an array"}')).toEqual([]);
    expect(parseMatchCandidates(null)).toEqual([]);
  });

  it('drops entries missing the fields the review UI needs', () => {
    const json = JSON.stringify([{ id: '1' }, { id: '2', name: 'Jay' }]);
    expect(parseMatchCandidates(json)).toEqual([{ id: '2', name: 'Jay', console: '' }]);
  });
});

describe('parseSnapshotSample', () => {
  it('recovers the sample size stored beside the raw payload', () => {
    const json = JSON.stringify({ sample: { salesVolumeYearly: 64 }, raw: {} });
    expect(parseSnapshotSample(json)).toEqual({ salesVolumeYearly: 64 });
  });

  it('returns null for snapshots that carry no sample metadata', () => {
    expect(parseSnapshotSample(null)).toBeNull();
    expect(parseSnapshotSample('{"raw":{}}')).toBeNull();
    expect(parseSnapshotSample('garbage')).toBeNull();
  });
});
