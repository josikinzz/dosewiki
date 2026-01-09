/**
 * Live region for announcing route changes to screen readers.
 *
 * This component provides accessibility for SPA navigation by
 * announcing the current page title when the route changes.
 */

import { useEffect, useState } from "react";

interface RouteAnnouncerProps {
  /**
   * The message to announce to screen readers.
   * Typically the page title or a description of the current view.
   */
  message: string;
}

/**
 * Visually hidden component that announces route changes to screen readers.
 *
 * Uses aria-live="polite" to announce changes without interrupting the user.
 * The message is cleared briefly before updating to ensure the change is announced.
 */
export function RouteAnnouncer({ message }: RouteAnnouncerProps) {
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    // Clear and re-set to ensure screen readers announce the change
    setAnnouncement("");
    const timer = setTimeout(() => {
      setAnnouncement(message);
    }, 100);

    return () => clearTimeout(timer);
  }, [message]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      {announcement}
    </div>
  );
}
