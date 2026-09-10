/**
 * Point-of-risk gate for scripts that write to a Convex deployment (the
 * reverse of `targetGuard.ts`). The production deployment is refused unless
 * `--allow-production` is present AND `CONVEX_REVERSE_IMPORT_CONFIRM` equals its
 * name, so a stray deploy key or `CONVEX_DEPLOYMENT` cannot point a rehearsal
 * at production. Rehearsals never qualify: they call `guardConvexTarget` with
 * `allowProduction: false` regardless of the flags they were given.
 */

export const PRODUCTION_CONVEX_DEPLOYMENT = "glad-minnow-656";

/** Deployment name carried by a `CONVEX_DEPLOY_KEY` (`<type>:<name>|<secret>`), `CONVEX_DEPLOYMENT` (`<type>:<name>`), or a `*.convex.cloud` URL. */
export function deploymentNameFrom(value: string | undefined): string | null {
  if (!value) return null;
  const url = value.match(/^https?:\/\/([a-z0-9-]+)\.convex\.(?:cloud|site)/i);
  if (url) return url[1];
  const keyed = value.match(/^(?:[a-z]+:)?([a-z0-9-]+)(?:\||$)/i);
  return keyed ? keyed[1] : null;
}

export function guardConvexTarget(deploymentName: string, allowProduction: boolean, env: NodeJS.ProcessEnv = process.env): void {
  if (!/^[a-z]+-[a-z]+-\d+$/.test(deploymentName)) {
    throw new Error(`Convex target must be a deployment name like joyful-capybara-123, got ${JSON.stringify(deploymentName)}`);
  }
  if (deploymentName !== PRODUCTION_CONVEX_DEPLOYMENT) return;
  if (!allowProduction) {
    throw new Error(`Refusing production deployment ${deploymentName}; pass --allow-production and CONVEX_REVERSE_IMPORT_CONFIRM=${deploymentName}`);
  }
  if (env.CONVEX_REVERSE_IMPORT_CONFIRM !== deploymentName) {
    throw new Error(`CONVEX_REVERSE_IMPORT_CONFIRM must equal ${deploymentName} to write to production`);
  }
}
