"use client";

import { useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Session } from "next-auth";
import { SessionProvider, useSession } from "next-auth/react";
import { clearEditorHint, writeEditorHint } from "@/lib/auth/editorHint";
import { canAccessDev } from "@/lib/auth/roles";

const queryClientOptions = {
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
};

/**
 * Leaves the editor hint behind from the authenticated editor data tree.
 *
 * `/dev` and `/review` own this combined data-provider tree. The editor-host
 * reading launcher has a separate, lazy session-only tree; it never needs the
 * hint. Appearance controls outside these providers still read the hint rather
 * than fetching a session on public hosts.
 *
 * Renders nothing. See `src/lib/auth/editorHint.ts` for why a separate flag rather than the session
 * token (every next-auth cookie is `httpOnly`), why middleware does not set it (JWT crypto and a
 * cookie-varying response on every public request), why `localStorage` rather than a cookie, and
 * why forging it buys nothing.
 */
function EditorHint() {
  const session = useSession();

  useEffect(() => {
    if (session.status === "loading") {
      return;
    }

    if (session.status === "authenticated" && canAccessDev(session.data.user?.role)) {
      writeEditorHint();
      return;
    }

    // Signing out, or signing in below contributor, retracts the hint.
    clearEditorHint();
  }, [session.status, session.data]);

  return null;
}

export function AppProviders({ children, session }: { children: ReactNode; session?: Session | null }) {
  const [queryClient] = useState(() => new QueryClient(queryClientOptions));

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider session={session}>
        <EditorHint />
        {children}
      </SessionProvider>
    </QueryClientProvider>
  );
}
