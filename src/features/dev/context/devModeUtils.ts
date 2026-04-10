import type { ManualIndexConfig } from "@/data/builders/manualIndexLoader";

export const EMPTY_INDEX_CONFIG: ManualIndexConfig = { version: 1, categories: [] };

export const deepClone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
