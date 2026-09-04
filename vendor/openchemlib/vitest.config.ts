import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// DoseWiki local modification: the test lane exercises the committed
// distributables instead of the GWT intermediate under lib/java, which is
// ignored and only exists after a JDK/GWT rebuild. A fresh checkout with the
// package-local dev dependencies installed can therefore run every test.
const dist = (file: string) =>
  fileURLToPath(new URL(`./dist/${file}`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '#lib_debug': dist('openchemlib.debug.js'),
      '#lib': dist('openchemlib.js'),
    },
  },
});
