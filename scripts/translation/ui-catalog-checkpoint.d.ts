export function catalogCheckpointKey(input: unknown): string;
export function catalogUsesVCode(source: string): boolean;
export function readCatalogCheckpoint(filename: string): Promise<Record<string, string>>;
export function writeCatalogCheckpoint(filename: string, entries: Record<string, string>): Promise<void>;
export function acceptedCheckpointTarget(entries: Record<string, string>, key: string, validate: (target: string) => { defects: readonly string[] }): string | null;
