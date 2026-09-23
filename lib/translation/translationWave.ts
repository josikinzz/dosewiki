/**
 * The bulk wave: state shared by the translation jobs of one worker run.
 *
 * A job hands the wave its work units and gets back a claim: the units it
 * must translate itself, and the fates of the units another job in the wave
 * already owns. Shared work is identified by locale, content hash, and prompt
 * version, so a job loaded after a glossary approval never waits on a segment
 * translated under the older prompt. Every segment write goes through one
 * serial writer that coalesces whatever queued behind the running transaction.
 */
import "server-only";

import type { WorkUnit } from "../../scripts/translation/engine.mjs";
import { writeTranslations, type TranslationSegmentRow } from "./segmentStore";

export type SegmentRejection = { hash: string; defects: string[] };

/** What the units of a claim came to, whichever job translated them. */
export type ClaimOutcome = { stored: number; rejected: SegmentRejection[] };

export type WaveClaim = {
  /** The units this claim must translate; every other unit is owned by an earlier claim with the same identity. */
  readonly owned: readonly WorkUnit[];
  /**
   * Persist the accepted rows of some owned units and record the rest as
   * rejected, then settle those segments for every claim sharing them. A
   * failed write fails those segments and throws.
   */
  settle(rows: readonly TranslationSegmentRow[], rejected: readonly SegmentRejection[]): Promise<void>;
  /** Fail every owned segment not yet settled, so no sharer waits on work that stopped. */
  abandon(error: unknown): void;
  /** The outcome of the units other claims own, once settled; throws the owner's failure. */
  shared(): Promise<ClaimOutcome>;
};

export type TranslationWave = {
  /** Claim `units` synchronously, so a claim made later in the same tick sees them as owned. */
  claim(locale: string, promptVersion: string, units: readonly WorkUnit[]): WaveClaim;
};

type SegmentFate = { stored: boolean; defects: string[] };
type Writer = (rows: readonly TranslationSegmentRow[]) => Promise<void>;

/**
 * Rows per segment transaction. Each write locks the one localized
 * publication producer row until commit, so the wave writes serially and
 * coalesces whatever queued behind the running transaction.
 */
const WAVE_WRITE_ROWS = 2000;

const identity = (locale: string, promptVersion: string, hash: string) => `${locale}\u0000${promptVersion}\u0000${hash}`;

function serialWriter(write: Writer): Writer {
  type Queued = { rows: readonly TranslationSegmentRow[]; resolve: () => void; reject: (error: unknown) => void };
  const queue: Queued[] = [];
  let draining = false;
  const drain = async () => {
    draining = true;
    while (queue.length > 0) {
      let count = 1;
      let size = queue[0].rows.length;
      while (count < queue.length && size + queue[count].rows.length <= WAVE_WRITE_ROWS) size += queue[count++].rows.length;
      const flush = queue.splice(0, count);
      const rows = new Map<string, TranslationSegmentRow>();
      for (const entry of flush) for (const row of entry.rows) rows.set(`${row.locale}\u0000${row.hash}`, row);
      try {
        await write([...rows.values()]);
        for (const entry of flush) entry.resolve();
      } catch (error) {
        for (const entry of flush) entry.reject(error);
      }
    }
    draining = false;
  };
  return (rows) => {
    if (rows.length === 0) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      queue.push({ rows, resolve, reject });
      if (!draining) void drain();
    });
  };
}

export function createTranslationWave(options: { write?: Writer } = {}): TranslationWave {
  const write = serialWriter(options.write ?? writeTranslations);
  const fates = new Map<string, Promise<SegmentFate>>();
  return {
    claim(locale, promptVersion, units) {
      const owned: WorkUnit[] = [];
      const shared: { hash: string; fate: Promise<SegmentFate> }[] = [];
      const open = new Map<string, { resolve: (fate: SegmentFate) => void; reject: (error: unknown) => void }>();
      for (const unit of units) {
        const key = identity(locale, promptVersion, unit.hash);
        const existing = fates.get(key);
        if (existing) {
          shared.push({ hash: unit.hash, fate: existing });
          continue;
        }
        owned.push(unit);
        const fate = new Promise<SegmentFate>((resolve, reject) => open.set(unit.hash, { resolve, reject }));
        fate.catch(() => {});
        fates.set(key, fate);
      }
      const close = (hash: string, settleFate: (entry: { resolve: (fate: SegmentFate) => void; reject: (error: unknown) => void }) => void) => {
        const entry = open.get(hash);
        if (!entry) return;
        open.delete(hash);
        settleFate(entry);
      };
      return {
        owned,
        async settle(rows, rejected) {
          try {
            await write(rows);
          } catch (error) {
            for (const row of rows) close(row.hash, (entry) => entry.reject(error));
            throw error;
          }
          for (const row of rows) close(row.hash, (entry) => entry.resolve({ stored: true, defects: [] }));
          for (const { hash, defects } of rejected) close(hash, (entry) => entry.resolve({ stored: false, defects }));
        },
        abandon(error) {
          for (const hash of [...open.keys()]) close(hash, (entry) => entry.reject(error));
        },
        shared: () => outcomeOf(shared),
      };
    },
  };
}

async function outcomeOf(shared: readonly { hash: string; fate: Promise<SegmentFate> }[]): Promise<ClaimOutcome> {
  const outcome: ClaimOutcome = { stored: 0, rejected: [] };
  for (const { hash, fate } of shared) {
    const { stored, defects } = await fate;
    if (stored) outcome.stored += 1;
    else outcome.rejected.push({ hash, defects });
  }
  return outcome;
}

/** A claim outside any wave: it owns every unit and writes on its own, as an incremental refresh does. */
export function soloClaim(units: readonly WorkUnit[], write: Writer = writeTranslations): WaveClaim {
  return {
    owned: units,
    settle: (rows) => write(rows),
    abandon() {},
    shared: async () => ({ stored: 0, rejected: [] }),
  };
}
