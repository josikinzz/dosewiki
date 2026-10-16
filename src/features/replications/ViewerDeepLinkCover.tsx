import { REPLICATION_VIEWER_PARAM } from "./galleryUrlState";

const COVER_ATTRIBUTE = "data-replication-viewer-cover";

const REVEAL_FLAG = "data-viewer-deep-link";

const REVEAL_SCRIPT =
  `try{if(new URLSearchParams(location.search).has("${REPLICATION_VIEWER_PARAM}"))` +
  `document.documentElement.setAttribute("${REVEAL_FLAG}","")}catch(e){}`;

const COVER_CSS =
  `html[${REVEAL_FLAG}] [${COVER_ATTRIBUTE}]{display:block}` +
  "@keyframes replication-viewer-cover-timeout{to{visibility:hidden}}";

export function ViewerDeepLinkCover() {
  return (
    <>
      <style>{COVER_CSS}</style>
      <div
        data-replication-viewer-cover=""
        aria-hidden
        className="fixed inset-0 z-[69] hidden bg-black"
        style={{
          animation: "replication-viewer-cover-timeout 0s linear 10s forwards",
        }}
      />
      <script dangerouslySetInnerHTML={{ __html: REVEAL_SCRIPT }} />
    </>
  );
}

export function dismissViewerDeepLinkCover() {
  document.documentElement.removeAttribute(REVEAL_FLAG);
}
