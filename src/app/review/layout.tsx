import { AppProviders } from "../providers";
import { getRequestSession } from "@server/next/requestSession";

/**
 * The review workbench needs the same client provider stack as the /dev shell
 * (Auth.js session, React Query): its controller calls `useSession`, which
 * throws without a mounted <SessionProvider />.
 */
export default async function ReviewLayout({ children }: { children: React.ReactNode }) {
  return <AppProviders session={await getRequestSession()}>{children}</AppProviders>;
}
