/**
 * Convex authentication configuration for WorkOS AuthKit.
 *
 * This configures JWT-based authentication using WorkOS as the identity provider.
 * When WORKOS_CLIENT_ID is not set, auth is disabled (allows anonymous access).
 *
 * SECURITY: This addresses VULN-01 and VULN-04 from the security audit by
 * replacing localStorage password storage with secure JWT-based sessions.
 */

// WorkOS Production Client ID
const clientId = "client_01KFN9WZ4WPC6JAK603XRA3QCW";

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
