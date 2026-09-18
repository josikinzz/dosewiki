import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { DataEditorTargetAlignment } from "@server/data/serverWriteHealth";

/** Only redacted target diagnostics cross this server-rendered refusal surface. */
type DataTargetSplitNoticeProps = {
  alignment: DataEditorTargetAlignment;
  surface: string;
};

/** Invalid native database configuration always refuses editor access. */
export function DataTargetSplitRefusal({ alignment, surface }: DataTargetSplitNoticeProps) {
  return (
    <main className="theme-page-shell flex min-h-screen items-start justify-center p-6 sm:items-center sm:p-8">
      <div className="w-full max-w-3xl">
        <Alert variant="destructive" role="alert">
          <AlertTitle className="text-lg font-semibold">
            Postgres configuration prevents editor access
          </AlertTitle>
          <AlertDescription>
            <p className="text-sm leading-6">
              The {surface} will not load until the server has a valid, consistent database target.
            </p>
            <p className="mt-3 text-sm leading-6">{alignment.summary}</p>
            <p className="mt-3 text-sm leading-6">
              Set <code className="font-mono">DATA_BACKEND=postgres</code> and configure{" "}
              <code className="font-mono">POSTGRES_POOLED_URL</code> or{" "}
              <code className="font-mono">POSTGRES_DIRECT_URL</code> on the server. When both
              connection URLs are set, they must identify the same database. Browser reads use
              same-origin routes and never need a public database URL. There is no target-split override.
            </p>
          </AlertDescription>
        </Alert>
      </div>
    </main>
  );
}
