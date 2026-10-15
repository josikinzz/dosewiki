import type { ReactNode } from "react";

import { ReplicationsSectionTitle } from "./_components/ReplicationsSectionTitle";

export const revalidate = 3600;

export default function ReplicationsSectionLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto w-full px-4 pb-20 pt-2 focus:outline-none 2xl:px-8"
    >
      <ReplicationsSectionTitle />
      {children}
    </main>
  );
}
