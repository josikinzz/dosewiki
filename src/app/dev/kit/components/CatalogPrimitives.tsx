"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

import { STATUS_META, type PropDoc, type StoryDef, type StoryExample } from "../registry/types";

function StatusChip({ status }: { status: NonNullable<StoryDef["status"]> }) { const meta = STATUS_META[status];
return (
  <span
    className="inline-flex items-center rounded-full border border-[var(--theme-border-subtle)] bg-[var(--theme-surface-muted)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]"
    style={{ color: meta.tone }}
  >
    {meta.label}
  </span>
); }

function CopyableCode({ code }: { code: string }) { const [copied, setCopied] = useState(false);

const copy = async () => {
  try {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  } catch {
    setCopied(false);
  }
};

return (
  <div className="flex items-center gap-2 rounded-lg border border-[var(--theme-border-subtle)] bg-[var(--theme-surface-muted)] px-3 py-2">
    <code className="flex-1 overflow-x-auto whitespace-pre text-xs text-[var(--theme-text-secondary)]">
      {code}
    </code>
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={copy}
      aria-label="Copy import"
      className="shrink-0 px-2"
    >
      {copied ? <Check className="text-[var(--theme-success-text)]" /> : <Copy />}
    </Button>
  </div>
); }

function ExampleStage({ example }: { example: StoryExample }) {
  const stage =
    example.background === "plain" ? (
      <div className="flex min-h-[3.5rem] flex-wrap items-center gap-3 p-5">{example.render()}</div>
    ) : (
      <Surface
        variant={example.background === "card" ? "card" : "subtle"}
        padding="md"
        radius="lg"
        className="flex min-h-[3.5rem] flex-wrap items-center gap-3"
      >
        {example.render()}
      </Surface>
    );

  return (
    <figure className={cn("flex flex-col gap-2", example.full && "sm:col-span-2")}>
      <figcaption className="flex flex-col gap-0.5">
        <span className="text-xs font-medium text-[var(--theme-text-secondary)]">{example.label}</span>
        {example.note ? (
          <span className="text-[11px] text-[var(--theme-text-muted)]">{example.note}</span>
        ) : null}
      </figcaption>
      {stage}
    </figure>
  );
}

function PropsTable({ props }: { props: PropDoc[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--theme-border-subtle)]">
      <table className="w-full border-collapse text-left text-xs">
        <thead>
          <tr className="text-[var(--theme-text-muted)]">
            <th className="px-3 py-2 font-medium">Prop</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Default</th>
            <th className="px-3 py-2 font-medium">Description</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--theme-border-subtle)]">
          {props.map((prop) => (
            <tr key={prop.name} className="align-top">
              <td className="px-3 py-2 font-mono text-[var(--theme-accent-strong)]">{prop.name}</td>
              <td className="px-3 py-2 font-mono text-[var(--theme-text-secondary)]">{prop.type}</td>
              <td className="px-3 py-2 font-mono text-[var(--theme-text-muted)]">{prop.default ?? "—"}</td>
              <td className="px-3 py-2 text-[var(--theme-text-secondary)]">{prop.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GuidanceList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "do" | "dont";
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <h4
        className="text-[11px] font-semibold uppercase tracking-[0.16em]"
        style={{
          color: tone === "do" ? "var(--theme-success-text)" : "var(--theme-warning-text)",
        }}
      >
        {title}
      </h4>
      <ul className="flex flex-col gap-1 text-xs text-[var(--theme-text-secondary)]">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span aria-hidden className="text-[var(--theme-text-muted)]">
              {tone === "do" ? "+" : "–"}
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StoryCard({
  story,
  activateExamples = false,
}: {
  story: StoryDef;
  activateExamples?: boolean;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [examplesActive, setExamplesActive] = useState(activateExamples);

  useEffect(() => {
    if (activateExamples) {
      setExamplesActive(true);
      return;
    }
    const card = cardRef.current;
    if (!card || examplesActive) return;

    const activateHashTarget = () => {
      if (window.location.hash === `#${story.id}`) setExamplesActive(true);
    };
    activateHashTarget();
    window.addEventListener("hashchange", activateHashTarget);

    if (typeof IntersectionObserver === "undefined") {
      setExamplesActive(true);
      return () => window.removeEventListener("hashchange", activateHashTarget);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setExamplesActive(true);
          observer.disconnect();
        }
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(card);
    return () => {
      observer.disconnect();
      window.removeEventListener("hashchange", activateHashTarget);
    };
  }, [activateExamples, examplesActive, story.id]);

  return (
    <Surface
      ref={cardRef}
      id={story.id}
      variant="card"
      padding="lg"
      radius="xl"
      className="scroll-mt-24 flex flex-col gap-5"
    >
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-lg font-semibold text-[var(--theme-text-primary)]">{story.name}</h3>
          {story.status ? <StatusChip status={story.status} /> : null}
          <code className="text-[11px] text-[var(--theme-text-muted)]">{story.source}</code>
        </div>
        <p className="max-w-[70ch] text-sm text-[var(--theme-text-secondary)]">{story.summary}</p>
      </header>

      <CopyableCode code={story.importLine} />

      {examplesActive ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {story.examples.map((example) => (
            <ExampleStage key={example.label} example={example} />
          ))}
        </div>
      ) : (
        <div
          aria-hidden="true"
          className="min-h-24 rounded-lg bg-[var(--theme-surface-muted)]"
        />
      )}

      {story.props && story.props.length > 0 ? <PropsTable props={story.props} /> : null}

      {(story.whenToUse?.length || story.whenNotToUse?.length) ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {story.whenToUse?.length ? (
            <GuidanceList title="Use it for" items={story.whenToUse} tone="do" />
          ) : null}
          {story.whenNotToUse?.length ? (
            <GuidanceList title="Reach elsewhere for" items={story.whenNotToUse} tone="dont" />
          ) : null}
        </div>
      ) : null}

      {story.notes?.length ? (
        <ul className="flex flex-col gap-1 text-xs text-[var(--theme-text-muted)]">
          {story.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
    </Surface>
  );
}
