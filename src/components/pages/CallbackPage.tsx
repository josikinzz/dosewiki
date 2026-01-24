/**
 * OAuth callback page for WorkOS AuthKit.
 *
 * This page handles the OAuth redirect after a user authenticates with WorkOS.
 * It displays a loading state while the authentication is being processed and
 * then redirects to the originally requested page (or dev tools by default).
 */

import { useEffect } from "react";
import { useConvexAuth } from "convex/react";
import { LoadingScreen } from "@/components/common/LoadingScreen";

/**
 * Session storage key for the return URL after authentication.
 */
const AUTH_RETURN_KEY = "dosewiki_auth_return_to";

/**
 * Store the current URL to return to after authentication.
 */
export function storeReturnUrl(url?: string): void {
  const returnUrl = url ?? window.location.pathname;
  sessionStorage.setItem(AUTH_RETURN_KEY, returnUrl);
}

/**
 * Get and clear the stored return URL.
 */
function getAndClearReturnUrl(): string {
  const returnUrl = sessionStorage.getItem(AUTH_RETURN_KEY);
  sessionStorage.removeItem(AUTH_RETURN_KEY);
  return returnUrl || "/dev/articles";
}

/**
 * OAuth callback page component.
 *
 * Displays a loading screen while authentication is being processed.
 * Once authenticated, redirects to the stored return URL.
 */
export function CallbackPage() {
  const { isLoading, isAuthenticated } = useConvexAuth();

  useEffect(() => {
    // Wait for auth to complete loading
    if (isLoading) return;

    // Once loaded, redirect to the return URL (whether authenticated or not)
    // If auth failed, the target page will handle showing the sign-in prompt
    const returnUrl = getAndClearReturnUrl();

    // Use replaceState + navigate to avoid back-button issues
    window.history.replaceState(null, "", returnUrl);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, [isLoading, isAuthenticated]);

  return <LoadingScreen />;
}
