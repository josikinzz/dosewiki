import { useEffect, useState } from "react";

interface RouteAnnouncerProps {
  message: string;
}

export function RouteAnnouncer({ message }: RouteAnnouncerProps) {
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
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
