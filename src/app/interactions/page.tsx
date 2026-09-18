import { redirect } from "next/navigation";
import { getLegacyRedirectTarget } from "@server/next/statusRedirectPolicy";

export default function InteractionsRedirectPage() {
  redirect(getLegacyRedirectTarget("interactions"));
}
