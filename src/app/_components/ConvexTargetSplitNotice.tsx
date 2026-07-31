import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { ConvexEditorTargetAlignment } from "@server/convex/serverWriteHealth";

/**
 * The refusal surface for a Convex read/write deployment split.
 *
 * A split means the browser loads an article from one deployment while every
 * privileged save is written to another. Optimistic-concurrency writes fail as
 * a bogus "changed since you loaded it" conflict; the full editor save has no
 * such check and silently writes the wrong database. Neither symptom names the
 * cause, so the surfaces stop instead of letting an editor work into a void.
 *
 * Rendered server-side only. The privileged write URL must never reach the
 * browser, so this component receives deployment *names* and nothing else.
 */

type ConvexTargetSplitNoticeProps = {
  alignment: ConvexEditorTargetAlignment;
  /** Human name of the surface that refused, e.g. "review workbench". */
  surface: string;
  /** The env var that downgrades the refusal to a banner. */
  overrideEnvVar: string;
};

/**
 * Inline, so the refusal never depends on the runtime icon fetch — a
 * configuration-failure screen has to render with nothing else working.
 */
function WarningGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
      aria-hidden="true"
    >
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function DeploymentRow({
  label,
  deploymentName,
  sourceEnvVar,
  detail,
}: {
  label: string;
  deploymentName: string | null;
  sourceEnvVar: string | null;
  detail: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 py-2">
      <span className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</span>
      <span className="font-mono text-base font-semibold">
        {deploymentName ?? "(unrecognised Convex URL)"}
      </span>
      <span className="text-xs opacity-80">
        {sourceEnvVar ? `resolved from ${sourceEnvVar}` : "no variable set"} — {detail}
      </span>
    </div>
  );
}

function SplitBody({
  alignment,
  surface,
  overrideEnvVar,
}: ConvexTargetSplitNoticeProps) {
  return (
    <>
      <div className="mt-3 grid gap-2 rounded-xl border border-[color:var(--theme-danger-border)] px-4 sm:grid-cols-2">
        <DeploymentRow
          label="Browser reads"
          deploymentName={alignment.read.deploymentName}
          sourceEnvVar={alignment.read.sourceEnvVar}
          detail="what you see on screen"
        />
        <DeploymentRow
          label="Privileged writes"
          deploymentName={alignment.write.deploymentName}
          sourceEnvVar={alignment.write.sourceEnvVar}
          detail="where every save would land"
        />
      </div>
      <p className="mt-3 text-sm leading-6">
        These two deployments hold different data by design. On this configuration the{" "}
        {surface} would show you one database and write your edits into the other:
        inline field edits fail as spurious &ldquo;changed since you loaded it&rdquo;
        conflicts, and the full article save reports success while overwriting the wrong
        deployment.
      </p>
      <p className="mt-3 text-sm leading-6">
        Fix it by pointing both chains at one deployment. Browser reads resolve{" "}
        <code className="font-mono">NEXT_PUBLIC_CONVEX_URL</code> then{" "}
        <code className="font-mono">VITE_CONVEX_URL</code>; privileged writes resolve{" "}
        <code className="font-mono">CONVEX_URL</code> then{" "}
        <code className="font-mono">VITE_CONVEX_URL</code> then{" "}
        <code className="font-mono">NEXT_PUBLIC_CONVEX_URL</code>. Setting{" "}
        <code className="font-mono">CONVEX_URL</code> and{" "}
        <code className="font-mono">NEXT_PUBLIC_CONVEX_URL</code> to the same deployment
        resolves it. Run <code className="font-mono">npm run convex:doctor</code> to
        confirm.
      </p>
      {alignment.overrideAcknowledged ? null : (
        <p className="mt-3 text-xs leading-5 opacity-80">
          To work on this split anyway — reads and writes will still disagree — set{" "}
          <code className="font-mono">{overrideEnvVar}=1</code> and restart the server.
          The surface then loads behind a permanent banner.
        </p>
      )}
    </>
  );
}

/**
 * Full-page refusal. The editor surface is not rendered at all.
 */
export function ConvexTargetSplitRefusal(props: ConvexTargetSplitNoticeProps) {
  return (
    <main className="theme-page-shell flex min-h-screen items-start justify-center p-6 sm:items-center sm:p-8">
      <div className="w-full max-w-3xl">
        <Alert variant="destructive" role="alert">
          <WarningGlyph />
          <AlertTitle className="text-lg font-semibold">
            Convex reads and writes point at different deployments
          </AlertTitle>
          <AlertDescription>
            <p className="text-sm leading-6">
              The {props.surface} will not load while this is true, because saving from it
              would corrupt the deployment you are not looking at.
            </p>
            <SplitBody {...props} />
          </AlertDescription>
        </Alert>
      </div>
    </main>
  );
}

/**
 * The acknowledged-override form: the surface loads, under a banner that cannot
 * be dismissed.
 */
export function ConvexTargetSplitBanner(props: ConvexTargetSplitNoticeProps) {
  return (
    <div className="p-3">
      <Alert variant="destructive" role="alert">
        <WarningGlyph />
        <AlertTitle className="text-base font-semibold">
          Saving from this surface writes {props.alignment.write.deploymentName ?? "another deployment"}, not{" "}
          {props.alignment.read.deploymentName ?? "the deployment you are reading"}
        </AlertTitle>
        <AlertDescription>
          <p className="text-sm leading-6">
            Running on an acknowledged read/write split ({props.overrideEnvVar}). Edits made
            here are written to a database whose contents you are not being shown.
          </p>
          <SplitBody {...props} />
        </AlertDescription>
      </Alert>
    </div>
  );
}
