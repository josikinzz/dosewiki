import { AppProviders } from "../providers";

export default function DevLayout({ children }: { children: React.ReactNode }) {
  return <AppProviders>{children}</AppProviders>;
}
