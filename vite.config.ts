import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import type { Plugin, UserConfig } from 'vite';
import type { OutputAsset, OutputChunk } from 'rollup';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const singleFilePlugin = (): Plugin => ({
  name: 'single-file-html',
  apply: 'build',
  enforce: 'post',
  generateBundle(_options, bundle) {
    const htmlEntries = Object.values(bundle).filter(
      (item): item is OutputAsset => item.type === 'asset' && item.fileName?.endsWith('.html'),
    );

    htmlEntries.forEach((htmlAsset) => {
      if (typeof htmlAsset.source !== 'string') return;

      let html = htmlAsset.source;

      for (const [fileName, asset] of Object.entries(bundle)) {
        if (asset.type === 'asset' && fileName.endsWith('.css') && typeof asset.source === 'string') {
          const pattern = new RegExp(
            `<link[^>]+href=["'](?:\\./|/)?${escapeRegex(fileName)}["'][^>]*>\\s*`,
            'g',
          );
          const inlined = html.replace(pattern, () => `<style>${asset.source}</style>`);

          if (inlined !== html) {
            html = inlined;
            delete bundle[fileName];
          }
        }
      }

      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type === 'chunk' && (chunk as OutputChunk).code && fileName.endsWith('.js')) {
          const pattern = new RegExp(
            `<script[^>]+src=["'](?:\\./|/)?${escapeRegex(fileName)}["'][^>]*><\\/script>`,
            'g',
          );
          const code = (chunk as OutputChunk).code.replace(/<\/script>/g, '<\\/script>');
          const script = `<script type="module">${code}</script>`;
          const inlined = html.replace(pattern, () => script);

          if (inlined !== html) {
            html = inlined;
            delete bundle[fileName];
          }
        }
      }

      htmlAsset.source = html;
    });
  },
});

export default defineConfig(({ mode }) => {
  const inline = mode === 'inline' || process.env.SINGLE_FILE === 'true';

  const config: UserConfig = {
    base: './',
    plugins: [react(), ...(inline ? [singleFilePlugin()] : [])],
    esbuild: {
      target: 'es2017',
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      fs: {
        allow: ['..'],
      },
    },
    publicDir: 'public',
  };

  config.build = {
    target: ['es2017', 'chrome80'],
    cssTarget: 'chrome80',
    ...(config.build ?? {}),
  };

  if (inline) {
    config.build = {
      ...config.build,
      assetsInlineLimit: Number.MAX_SAFE_INTEGER,
      cssCodeSplit: false,
    };
  }

  return config;
});
