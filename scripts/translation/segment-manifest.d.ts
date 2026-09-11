import type { WorkUnit } from "./engine";

export type Segment = {
  slug: string;
  path: string;
  pointer: (string | number)[];
  group: string;
  markup: boolean;
  contextClass: "safety" | "prose";
  hash: string;
  words: number;
  source: string;
  span?: { index: number; start: number; end: number; kind: "text" | "attr" };
};

export type SegmentDataset<Item = Record<string, unknown>> = {
  items: Item[];
  dataset?: string;
  generatedAt?: string;
};

export function segmentHash(text: string): string;
export function isTranslatableValue(value: unknown): boolean;
export function extractSegments(dataset: SegmentDataset, corpus?: unknown): { segments: Segment[]; counts: Record<string, unknown> };
export function buildWorkUnits(segments: readonly Segment[]): WorkUnit[];
export function assembleLocaleDataset<Item>(
  dataset: SegmentDataset<Item>,
  segments: readonly Segment[],
  translationsByHash: Map<string, string>,
  options?: { locale?: string; corpus?: unknown; parse?: unknown },
): { dataset: SegmentDataset<Item> & { locale?: string }; applied: number; missing: number };
