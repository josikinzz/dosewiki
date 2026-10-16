export function evaluateReleaseEvidence({ expectedDigest, observedDigest, checks, status }) {
  const failures = [];
  if (status !== 200) failures.push(`HTTP ${status}`);
  if (!expectedDigest || observedDigest !== expectedDigest) failures.push("The rendered catalog does not match this compiled catalog.");
  if (!checks.length) failures.push("No rendered surfaces were checked.");
  for (const check of checks) {
    if (!check.passed) failures.push(`Rendered label mismatch: ${check.id}`);
  }
  return { verified: failures.length === 0, failures };
}
