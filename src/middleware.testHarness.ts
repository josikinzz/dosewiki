import { vi } from "vitest";
import { NextRequest } from "next/server";

export function makeRequest(path: string): NextRequest {
  vi.stubEnv("NEXT_PUBLIC_EDITOR_BUILD", "true");
  return new NextRequest(
    new Request(`https://dosewiki-admin.vercel.app${path}`, {
      headers: { host: "dosewiki-admin.vercel.app" },
    }),
  );
}

export function makePublicRequest(
  path: string,
  headers: Record<string, string> = {},
): NextRequest {
  vi.stubEnv("NEXT_PUBLIC_EDITOR_BUILD", "false");
  return new NextRequest(
    new Request(`https://dose.wiki${path}`, {
      headers: { host: "dose.wiki", ...headers },
    }),
  );
}
