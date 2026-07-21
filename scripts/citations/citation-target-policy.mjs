export function assertExplicitCitationPromotionTarget(context) {
  if (!context?.targetUrl) {
    throw new Error("Citation promotion requires TARGET_CONVEX_URL; browser/default Convex URL fallbacks are not allowed.");
  }
  if (context.targetUrlKey !== "TARGET_CONVEX_URL") {
    throw new Error(`Citation promotion requires TARGET_CONVEX_URL; received ${context.targetUrlKey ?? "no explicit target"}.`);
  }
  if (!context.deploymentFingerprint) {
    throw new Error("Citation promotion target must identify one HTTPS .convex.cloud deployment.");
  }
  if (!context.expectedDeployment) {
    throw new Error(`Citation promotion dry-runs and writes require --expected-deployment=${context.deploymentFingerprint}.`);
  }
  if (context.expectedDeployment !== context.deploymentFingerprint) {
    throw new Error(
      `Expected deployment ${context.expectedDeployment} does not match citation target ${context.deploymentFingerprint}.`,
    );
  }
  return context.targetUrl;
}
