"use client";

import { useMemo, useState } from "react";

import { AppearanceControls } from "@/app/_components/AppearanceControls";
import { Surface } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

import { StoryCard } from "./components/CatalogPrimitives";
import { IntentGuide } from "./components/IntentGuide";
import { stories } from "./registry";
import { KIT_TIERS } from "./registry/types";

const COLOR_TOKENS: { token: string; label: string }[] = [
  { token: "--theme-body-bg", label: "body-bg" },
  { token: "--theme-surface-muted", label: "surface-muted" },
  { token: "--theme-surface-soft", label: "surface-soft" },
  { token: "--theme-surface-strong", label: "surface-strong" },
  { token: "--theme-accent", label: "accent" },
  { token: "--theme-accent-strong", label: "accent-strong" },
  { token: "--theme-text-primary", label: "text-primary" },
  { token: "--theme-text-secondary", label: "text-secondary" },
  { token: "--theme-text-muted", label: "text-muted" },
  { token: "--theme-border-subtle", label: "border-subtle" },
  { token: "--theme-danger-text", label: "danger-text" },
  { token: "--theme-success-text", label: "success-text" },
  { token: "--theme-warning-text", label: "warning-text" },
];

const RADIUS_SCALE: { label: string; cls: string }[] = [
  { label: "chip", cls: "rounded-chip" },
  { label: "control", cls: "rounded-control" },
  { label: "card", cls: "rounded-card" },
  { label: "panel", cls: "rounded-panel" },
  { label: "pill", cls: "rounded-pill" },
];
const PADDING_SCALE = ["xs · p-3", "sm · p-4", "md · p-5", "lg · p-6", "xl · p-8"];

function TokenShowcase() {
  return (
    <Surface id="tokens" variant="card" padding="lg" radius="xl" className="scroll-mt-24 flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold text-[var(--theme-text-primary)]">Tokens</h3>
        <p className="max-w-[70ch] text-sm text-[var(--theme-text-secondary)]">
          The token system is the source of truth. Consume <code>--theme-*</code> variables or the{" "}
          <code>dose-*</code> Tailwind aliases — not raw hex or <code>fuchsia-*</code> utilities. Light mode
          largely mirrors dark (reverso) as a guideline; toggle the theme to check both.
        </p>
      </header>

      <div className="flex flex-col gap-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--theme-text-muted)]">
          Color
        </h4>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
          {COLOR_TOKENS.map(({ token, label }) => (
            <div
              key={token}
              className="flex items-center gap-2 rounded-lg border border-[var(--theme-border-subtle)] bg-[var(--theme-surface-muted)] p-2"
            >
              <span
                aria-hidden
                className="h-7 w-7 shrink-0 rounded-md border border-[var(--theme-border-subtle)]"
                style={{ backgroundColor: `var(${token})` }}
              />
              <span className="overflow-hidden text-ellipsis text-[11px] text-[var(--theme-text-secondary)]">
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--theme-text-muted)]">
            Radius
          </h4>
          <div className="flex flex-wrap gap-2">
            {RADIUS_SCALE.map((r) => (
              <div
                key={r.label}
                className={cn(
                  "flex h-12 w-12 items-center justify-center border border-[var(--theme-border-subtle)] bg-[var(--theme-surface-muted)] text-[10px] text-[var(--theme-text-muted)]",
                  r.cls,
                )}
              >
                {r.label}
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--theme-text-muted)]">
            Padding scale
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {PADDING_SCALE.map((p) => (
              <span
                key={p}
                className="rounded-md border border-[var(--theme-border-subtle)] bg-[var(--theme-surface-muted)] px-2 py-1 text-[11px] text-[var(--theme-text-secondary)]"
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Surface>
  );
}

export function KitCatalog() {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return stories;
    return stories.filter((story) =>
      [story.name, story.summary, ...story.exports].join(" ").toLowerCase().includes(q),
    );
  }, [query]);

  const filteredByTier = useMemo(
    () => ({
      primitive: filtered
        .filter((story) => story.tier === "primitive")
        .sort((a, b) => a.name.localeCompare(b.name)),
      common: filtered
        .filter((story) => story.tier === "common")
        .sort((a, b) => a.name.localeCompare(b.name)),
      layout: filtered
        .filter((story) => story.tier === "layout")
        .sort((a, b) => a.name.localeCompare(b.name)),
    }),
    [filtered],
  );

  return (
    <div className="min-h-screen bg-[var(--theme-body-bg)] text-[var(--theme-text-primary)]">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-4 py-8 lg:flex-row lg:gap-10 lg:px-8">
        <aside className="lg:sticky lg:top-8 lg:h-[calc(100vh-4rem)] lg:w-64 lg:shrink-0 lg:overflow-y-auto">
          <nav className="flex flex-col gap-5 text-sm">
            <a href="#which-one" className="font-medium text-[var(--theme-text-secondary)] hover:text-[var(--theme-accent-strong)]">
              Which one?
            </a>
            <a href="#tokens" className="font-medium text-[var(--theme-text-secondary)] hover:text-[var(--theme-accent-strong)]">
              Tokens
            </a>
            {KIT_TIERS.map((tier) => {
              const tierStories = filteredByTier[tier.id];
              if (tierStories.length === 0) return null;
              return (
                <div key={tier.id} className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--theme-text-muted)]">
                    {tier.label}
                  </span>
                  {tierStories.map((story) => (
                    <a
                      key={story.id}
                      href={`#${story.id}`}
                      className="text-[var(--theme-text-secondary)] hover:text-[var(--theme-accent-strong)]"
                    >
                      {story.name}
                    </a>
                  ))}
                </div>
              );
            })}
          </nav>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col gap-6">
          <header className="flex flex-col gap-4 border-b border-[var(--theme-border-subtle)] pb-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-semibold text-[var(--theme-text-primary)]">UI Kit</h1>
                <p className="max-w-[70ch] text-sm text-[var(--theme-text-secondary)]">
                  The shared component catalog. Every primitive renders live here — use these before building new
                  UI. Ownership rules live in <code>docs/design/ui-kit.md</code>.
                </p>
                <p className="max-w-[70ch] text-sm text-[var(--theme-text-muted)]">
                  The appearance controls dress the whole document, so every story below is the parity harness for
                  all four Fun/Pro × day/night combinations. There is one kit — a story that only passes in one
                  combination is a token or call-site defect, never a reason to fork the component.
                </p>
              </div>
              <AppearanceControls />
            </div>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter components…"
              className="w-full max-w-sm rounded-lg border border-[var(--theme-border-subtle)] bg-[var(--theme-surface-muted)] px-3 py-2 text-sm text-[var(--theme-text-primary)] placeholder:text-[var(--theme-text-muted)] theme-field-focus"
            />
          </header>

          {!query ? <IntentGuide /> : null}
          {!query ? <TokenShowcase /> : null}

          {KIT_TIERS.map((tier) => {
            const tierStories = filteredByTier[tier.id];
            if (tierStories.length === 0) return null;
            return (
              <section key={tier.id} className="flex flex-col gap-4">
                <div className="flex flex-col gap-0.5">
                  <h2 className="text-xl font-semibold text-[var(--theme-text-primary)]">{tier.label}</h2>
                  <p className="text-xs text-[var(--theme-text-muted)]">{tier.blurb}</p>
                </div>
                {tierStories.map((story) => (
                  <StoryCard key={story.id} story={story} activateExamples={query.trim() !== ""} />
                ))}
              </section>
            );
          })}

          {filtered.length === 0 ? (
            <Surface variant="subtle" padding="lg" radius="xl" className="theme-text-muted text-center text-sm">
              No components match “{query}”.
            </Surface>
          ) : null}
        </main>
      </div>
    </div>
  );
}
