"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
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

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient(queryClientOptions));

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <ConvexProvider>{children}</ConvexProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
