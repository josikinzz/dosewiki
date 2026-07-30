import { AppProviders } from "../providers";

/**
 * The review workbench needs the same client provider stack as the /dev shell
 * (Auth.js session, React Query): its controller calls `useSession`, which
 * throws without a mounted <SessionProvider />.
 */
export default function ReviewLayout({ children }: { children: React.ReactNode }) {
  return <AppProviders>{children}</AppProviders>;
}
