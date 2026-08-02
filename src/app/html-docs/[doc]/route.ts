import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { isEffectIndex } from "@/config/siteFlavor";

/**
 * Unlisted raw-HTML doc host: serves self-contained files from `html-docs/` at the repo
 * root with no app shell. The public-document CSP still applies (middleware), so files
 * must inline everything — external font/script CDNs are blocked. dose.wiki construction
 * hosts never reach here (middleware host gate); Effect Index 404s on flavor.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DOC_NAME_RE = /^[a-z0-9][a-z0-9._-]*$/;
const DOCS_DIR = path.join(process.cwd(), "html-docs");

function notFound(): NextResponse {
  return new NextResponse("Not found", { status: 404 });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ doc: string }> },
) {
  if (isEffectIndex()) return notFound();
  const { doc } = await params;
  if (!DOC_NAME_RE.test(doc)) return notFound();
  const fileName = doc.endsWith(".html") ? doc : `${doc}.html`;
  const filePath = path.resolve(DOCS_DIR, fileName);
  if (!filePath.startsWith(DOCS_DIR + path.sep)) return notFound();
  let html: string;
  try {
    html = await fs.readFile(filePath, "utf8");
  } catch {
    return notFound();
  }
  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
      "Cache-Control": "no-store",
    },
  });
}
