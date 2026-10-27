import assert from "node:assert/strict";
import { parseArgs } from "node:util";
import { chromium, firefox } from "playwright-core";

const { values } = parseArgs({
  options: {
    base: { type: "string", default: "http://127.0.0.1:3100" },
    path: { type: "string", multiple: true },
  },
});
const paths = values.path ?? ["/dextromethorphan", "/lsd"];

for (const engine of [firefox, chromium]) {
  const browser = await engine.launch();
  try {
    for (const width of [1440, 390]) {
      for (const fault of [false, true]) {
        const context = await browser.newContext({ viewport: { width, height: 900 } });
        try {
          await context.route("**/*", (route) =>
            ["GET", "HEAD"].includes(route.request().method())
              ? route.continue()
              : route.abort(),
          );
          await context.addInitScript(({ fault }) => {
            localStorage.setItem("dosewiki-accent-hue-fun", "181");
            localStorage.setItem("dosewiki-chroma-surface-fun", "0");
            if (!fault) return;
            const measureElement = Element.prototype.getBoundingClientRect;
            Element.prototype.getBoundingClientRect = function () {
              const rect = measureElement.call(this);
              return this.matches("#introduction h1")
                ? new DOMRect(rect.x, rect.y, rect.width, 6585)
                : rect;
            };
            const measureRange = Range.prototype.getBoundingClientRect;
            Range.prototype.getBoundingClientRect = function () {
              const rect = measureRange.call(this);
              const node = this.commonAncestorContainer;
              const element = node instanceof Element ? node : node.parentElement;
              return element?.closest("#introduction h1")
                ? new DOMRect(rect.x, rect.y, 1200, rect.height)
                : rect;
            };
          }, { fault });
          const page = await context.newPage();
          for (const path of paths) {
            await page.goto(new URL(path, values.base).href, { waitUntil: "networkidle" });
            await page.locator("#introduction h1").waitFor();
            for (const font of ["standard", "system", "lexend"]) {
              await page.evaluate((font) => document.documentElement.setAttribute("data-font", font), font);
              await page.evaluate(async () => {
                await document.fonts.ready;
                for (let frame = 0; frame < 4; frame++) {
                  await new Promise((resolve) => requestAnimationFrame(resolve));
                }
              });
              const geometry = await page.locator("#introduction").evaluate((hero) => {
                const molecule = hero.querySelector("[data-hero-molecule-layout]");
                const heading = hero.querySelector("h1");
                return {
                  margin: parseFloat(molecule?.style.marginTop ?? "0") || 0,
                  titleTop: heading.offsetTop,
                  titleHeight: heading.offsetHeight,
                  moleculeTop: molecule?.offsetTop ?? 0,
                  below: molecule?.dataset.heroMoleculeLayout === "below-title",
                };
              });
              const label = `${engine.name()} ${width} ${path} ${font} fault=${fault}`;
              assert.ok(geometry.margin < 500, `${label}: excessive measured margin ${geometry.margin}`);
              assert.ok(geometry.titleHeight < 500, `${label}: title grew excessively`);
              if (width >= 768 && geometry.below) {
                assert.ok(geometry.moleculeTop >= geometry.titleTop + geometry.titleHeight, `${label}: molecule overlaps title`);
                assert.ok(geometry.moleculeTop < geometry.titleTop + geometry.titleHeight + 100, `${label}: blank gap`);
              }
              console.log(`PASS ${label}`);
            }
          }
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
}
