import { redirect } from "next/navigation";
import { getLegacyRedirectTarget } from "@server/next/statusRedirectPolicy";

export default function DataRedirectPage() {
  redirect(getLegacyRedirectTarget("data"));
}
