/**
 * Renders a self-contained explainer document (served from /public/docs)
 * inside an isolated iframe so its bespoke styling stays intact while the
 * site's sticky header and footer wrap it via the root layout.
 */
export function ExplainerFrame({ src, title }: { src: string; title: string }) {
  return (
    <main
      id="main-content"
      className="theme-page-shell"
      style={{ background: "#0f0a1f" }}
    >
      <iframe
        src={src}
        title={title}
        style={{
          display: "block",
          width: "100%",
          height: "calc(100dvh - var(--theme-header-height, 4.25rem))",
          border: 0,
        }}
      />
    </main>
  );
}
