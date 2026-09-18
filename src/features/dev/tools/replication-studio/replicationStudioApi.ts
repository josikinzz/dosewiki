export async function readReplicationApiError(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? fallback;
  } catch {
    return fallback;
  }
}
