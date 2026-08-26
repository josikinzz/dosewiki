type PrePaintRouteStateCoverProps = {
  id: string;
  legacyHashes?: readonly string[];
  queryKeys?: readonly string[];
};

const FLAG_ATTRIBUTE = "data-prepaint-route-state";
const COVER_ATTRIBUTE = "data-prepaint-route-cover";

/**
 * Hide a statically rendered default projection before first paint when only
 * the browser can see the incoming URL state. Canonical path routes do not
 * need this; it exists for legacy fragments and static query-filter fallbacks.
 */
export function PrePaintRouteStateCover({
  id,
  legacyHashes = [],
  queryKeys = [],
}: PrePaintRouteStateCoverProps) {
  const safeId = id.replace(/[^a-z0-9-]/giu, "");
  const revealScript = `try{const h=decodeURIComponent(location.hash.slice(1)).trim().toLowerCase();const p=new URLSearchParams(location.search);if(${JSON.stringify(
    legacyHashes.map((hash) => hash.toLowerCase()),
  )}.includes(h)||${JSON.stringify(queryKeys)}.some((key)=>p.has(key)))document.documentElement.setAttribute(${JSON.stringify(
    FLAG_ATTRIBUTE,
  )},${JSON.stringify(safeId)})}catch(e){}`;
  const coverCss =
    `html[${FLAG_ATTRIBUTE}="${safeId}"] [${COVER_ATTRIBUTE}="${safeId}"]{display:block}` +
    "@keyframes prepaint-route-cover-timeout{to{visibility:hidden}}";

  return (
    <>
      <style>{coverCss}</style>
      <div
        aria-hidden
        data-prepaint-route-cover={safeId}
        className="theme-page-shell fixed inset-0 z-[68] hidden"
        style={{ animation: "prepaint-route-cover-timeout 0s linear 10s forwards" }}
      />
      <script dangerouslySetInnerHTML={{ __html: revealScript }} />
    </>
  );
}

export function dismissPrePaintRouteStateCover(id: string): void {
  if (document.documentElement.getAttribute(FLAG_ATTRIBUTE) === id) {
    document.documentElement.removeAttribute(FLAG_ATTRIBUTE);
  }
}
