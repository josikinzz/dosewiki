import { blurDisabledIn } from "./themeLabStorage";
import {
  emptyOverrides,
  readStoredEnvelope,
  writeBlurAttribute,
  writeOverrideStyle,
} from "./themeLabStorage";
import { isReplicationEmbedPath } from "@server/next/replicationEmbedPolicy";

// Runs immediately after the ordinary appearance bootstrap. Reuse the runtime's
// parser (including legacy migration) and CSS writer, without mounting persistence.
if (!isReplicationEmbedPath(window.location.pathname)) {
  const { envelope, raw } = readStoredEnvelope();
  if (raw !== null) {
    const style = document.documentElement.dataset.visualStyle ?? "fun";
    const overrides = envelope.editsByLook[style] ?? emptyOverrides();
    writeOverrideStyle(overrides);
    writeBlurAttribute(blurDisabledIn(overrides));
  }
}
