import { AppProviders } from "../providers";
import { getRequestSession } from "@server/next/requestSession";

export default async function DevLayout({ children }: { children: React.ReactNode }) {
  return <AppProviders session={await getRequestSession()}>{children}</AppProviders>;
}
