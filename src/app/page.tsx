import { redirect } from "next/navigation";
import { getLegacyRedirectTarget } from "@server/next/statusRedirectPolicy";

export default function HomePage() {
  redirect(getLegacyRedirectTarget("home"));
}
