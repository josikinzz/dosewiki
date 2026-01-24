/**
 * Convex authentication configuration for WorkOS AuthKit.
 *
 * This configures JWT-based authentication using WorkOS as the identity provider.
 * The WORKOS_CLIENT_ID is auto-provisioned by Convex when using the authKit
 * configuration in convex.json.
 *
 * SECURITY: This addresses VULN-01 and VULN-04 from the security audit by
 * replacing localStorage password storage with secure JWT-based sessions.
 */

const clientId = process.env.WORKOS_CLIENT_ID;

const authConfig = {
  providers: [
    {
      type: "customJwt" as const,
      issuer: `https://api.workos.com/`,
      algorithm: "RS256" as const,
      jwks: `https://api.workos.com/sso/jwks/${clientId}`,
      applicationID: clientId,
    },
    {
      type: "customJwt" as const,
      issuer: `https://api.workos.com/user_management/${clientId}`,
      algorithm: "RS256" as const,
      jwks: `https://api.workos.com/sso/jwks/${clientId}`,
    },
  ],
};

export default authConfig;
