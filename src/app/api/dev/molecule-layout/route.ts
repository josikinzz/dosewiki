/* eslint-disable vercel-guardrails/require-rate-limit -- local-only filesystem dev tool,
   hard-disabled in production via isProduction(); request rate limiting is not applicable. */
/**
 * Dev-only load/save endpoint for the Molecule Depiction Editor (`/dev` → Molecules).
 *
 * It is a LOCAL authoring tool: it reads and writes files in the working tree, so it
 * is hard-disabled in production (Vercel's filesystem is read-only/ephemeral anyway).
 *
 *   GET  /api/dev/molecule-layout            → list { slug, title, hasOverride }[]
 *   GET  /api/dev/molecule-layout?slug=lsd   → { slug, smiles, molblock, source }
 *   POST /api/dev/molecule-layout            → { slug, molblock, svg }
 *        writes src/data/molecules/overrides/<slug>.mol, then re-renders the canonical
 *        public/molecules/<slug>.svg via the Python pipeline (falls back to the posted
 *        browser SVG when the RDKit venv isn't available).
 */
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const ROOT = process.cwd();
const OVERRIDES_REL = "src/data/molecules/overrides";
const BASE_REL = "src/data/molecules/base";
const PUBLIC_MOL_REL = "public/molecules";
const COVERAGE_REL = "notes-and-plans/reports/smiles-coverage.json";

const OVERRIDES_DIR = path.join(ROOT, OVERRIDES_REL);
const BASE_DIR = path.join(ROOT, BASE_REL);
const PUBLIC_MOL_DIR = path.join(ROOT, PUBLIC_MOL_REL);

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const MAX_MOLBLOCK_BYTES = 256 * 1024;
const MAX_SVG_BYTES = 2 * 1024 * 1024;

const isProduction = () => process.env.NODE_ENV === "production";
const forbidden = () =>
  NextResponse.json(
    { error: "The molecule editor is a local-only dev tool." },
    { status: 403 },
  );

type CoverageRow = { slug: string; title?: string; smiles?: unknown };

async function readCoverage(): Promise<CoverageRow[]> {
  try {
    const raw = await readFile(path.join(ROOT, COVERAGE_REL), "utf8");
    const rows = JSON.parse(raw);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

async function smilesFor(slug: string): Promise<string> {
  const row = (await readCoverage()).find((r) => r.slug === slug);
  return typeof row?.smiles === "string" ? row.smiles : "";
}

async function readMolIfExists(dir: string, slug: string): Promise<string | null> {
  const p = path.join(dir, `${slug}.mol`);
  if (!existsSync(p)) return null;
  return readFile(p, "utf8");
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------
export async function GET(request: Request) {
  if (isProduction()) return forbidden();

  const slug = new URL(request.url).searchParams.get("slug");

  if (!slug) {
    // Picker payload: every covered molecule + whether it already has an override.
    const coverage = await readCoverage();
    let overrideSlugs = new Set<string>();
    try {
      const files = await readdir(OVERRIDES_DIR);
      overrideSlugs = new Set(
        files.filter((f) => f.endsWith(".mol")).map((f) => f.slice(0, -4)),
      );
    } catch {
      /* dir may not exist yet */
    }
    const molecules = coverage
      .filter((r) => r.slug && (typeof r.smiles === "string" ? r.smiles : ""))
      .map((r) => ({
        slug: r.slug,
        title: r.title ?? r.slug,
        hasOverride: overrideSlugs.has(r.slug),
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
    return NextResponse.json({ molecules });
  }

  if (!SLUG_RE.test(slug)) {
    return NextResponse.json({ error: "Invalid slug." }, { status: 400 });
  }

  // `variant=base` forces the auto-layout starting point even when an override exists
  // (powers the editor's "Revert to auto layout" action).
  const forceBase =
    new URL(request.url).searchParams.get("variant") === "base";
  const override = forceBase ? null : await readMolIfExists(OVERRIDES_DIR, slug);
  const molblock = override ?? (await readMolIfExists(BASE_DIR, slug));
  if (!molblock) {
    return NextResponse.json(
      {
        error: `No molblock for "${slug}". Run \`npm run molecules:generate\` to emit base molblocks.`,
      },
      { status: 404 },
    );
  }

  const overrideExists = existsSync(path.join(OVERRIDES_DIR, `${slug}.mol`));
  return NextResponse.json({
    slug,
    smiles: await smilesFor(slug),
    molblock,
    source: override ? "override" : "base",
    hasOverride: overrideExists,
  });
}

// ---------------------------------------------------------------------------
// DELETE — remove an override and re-render the public SVG from auto layout.
// ---------------------------------------------------------------------------
export async function DELETE(request: Request) {
  if (isProduction()) return forbidden();

  const slug = new URL(request.url).searchParams.get("slug");
  if (!slug || !SLUG_RE.test(slug)) {
    return NextResponse.json({ error: "Invalid slug." }, { status: 400 });
  }

  const overridePath = path.join(OVERRIDES_DIR, `${slug}.mol`);
  if (existsSync(overridePath)) {
    await rm(overridePath);
  }
  // Re-render the canonical SVG from SMILES auto-layout (no override now present).
  renderCanonicalSvg(slug, await smilesFor(slug));
  return NextResponse.json({ ok: true, slug, hasOverride: false });
}

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------
type SavePayload = { slug?: unknown; molblock?: unknown; svg?: unknown };

export async function POST(request: Request) {
  if (isProduction()) return forbidden();

  let body: SavePayload;
  try {
    body = (await request.json()) as SavePayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { slug, molblock, svg } = body;
  if (typeof slug !== "string" || !SLUG_RE.test(slug)) {
    return NextResponse.json({ error: "Invalid slug." }, { status: 400 });
  }
  if (typeof molblock !== "string" || molblock.length > MAX_MOLBLOCK_BYTES) {
    return NextResponse.json({ error: "Invalid molblock." }, { status: 400 });
  }
  if (typeof svg !== "string" || svg.length > MAX_SVG_BYTES || !svg.includes("<svg")) {
    return NextResponse.json({ error: "Invalid svg." }, { status: 400 });
  }

  // 1. Persist the authored override (this is the durable, tracked artifact).
  await mkdir(OVERRIDES_DIR, { recursive: true });
  await writeFile(path.join(OVERRIDES_DIR, `${slug}.mol`), molblock, "utf8");

  // 2. Update the public asset. Prefer the canonical Python render (brand TTF font);
  //    fall back to the editor's in-browser SVG when the RDKit venv isn't available.
  await mkdir(PUBLIC_MOL_DIR, { recursive: true });
  const canonical = renderCanonicalSvg(slug, await smilesFor(slug));
  if (!canonical) {
    await writeFile(path.join(PUBLIC_MOL_DIR, `${slug}.svg`), svg, "utf8");
  }

  return NextResponse.json({ ok: true, slug, renderedBy: canonical ? "python" : "browser" });
}

/**
 * Best-effort: re-render the canonical brand SVG from the just-saved override via the
 * existing Python pipeline, so the public asset matches the rest of the site's font.
 * Returns false (caller writes the browser SVG) when Python/script rendering is unavailable.
 */
function renderCanonicalSvg(slug: string, smiles: string): boolean {
  const py = process.env.MOLECULE_PYTHON || "python3.13";
  const script = path.join(ROOT, "scripts", "chemistry", "render_molecules.py");
  if ((path.isAbsolute(py) && !existsSync(py)) || !existsSync(script)) return false;

  const input = path.join(os.tmpdir(), `dosewiki-molrender-${slug}.json`);
  try {
    // spawnSync needs the input on disk; a single-item render keyed by this slug.
    writeFileSync(input, JSON.stringify([{ key: slug, title: slug, smiles }]));
    const res = spawnSync(
      py,
      [
        script,
        "--input", input,
        "--outdir", PUBLIC_MOL_REL,
        "--overrides", OVERRIDES_REL,
      ],
      { cwd: ROOT, encoding: "utf8" },
    );
    return res.status === 0 && existsSync(path.join(PUBLIC_MOL_DIR, `${slug}.svg`));
  } catch {
    return false;
  }
}
