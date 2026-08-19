"use client";

import { useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider, useSession } from "next-auth/react";
import { clearEditorHint, writeEditorHint } from "@/lib/auth/editorHint";
import { canAccessDev } from "@/lib/auth/roles";
import { ConvexProvider } from "@/lib/convex";

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
 * Leaves the editor hint behind, from the one tree that actually knows the role.
 *
 * This is the only tree with a session: `/dev` and `/review` mount it, the public tree does not.
 * So it is also the only place that can honestly answer "may this reader open the Theme Lab" —
 * and the appearance cog that most readers meet is rendered by the root layout's footer
 * (`src/app/layout.tsx:110`), a *sibling* of `{children}`, outside this provider on every route.
 * That cog reads the hint instead of asking, which is why it had nothing to show before.
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

    // Signing out, or signing in below editor, retracts the hint. This tree is the only one that
    // ever learns either fact, so it is the only one that can.
    clearEditorHint();
  }, [session.status, session.data]);

  return null;
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient(queryClientOptions));

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <EditorHint />
        <ConvexProvider>{children}</ConvexProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
