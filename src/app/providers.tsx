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

    clearEditorHint();
  }, [session.status, session.data]);

  return null;
}

export function AppProviders({
  children,
  session,
  sessionBasePath,
}: {
  children: ReactNode;
  session?: Session | null;
  sessionBasePath?: string;
}) {
  const [queryClient] = useState(() => new QueryClient(queryClientOptions));

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider session={session} basePath={sessionBasePath}>
        <EditorHint />
        {children}
      </SessionProvider>
    </QueryClientProvider>
  );
}
