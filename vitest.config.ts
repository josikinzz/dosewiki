import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'lib/**/*.{test,spec}.{ts,tsx}', 'server/**/*.{test,spec}.ts'],
    exclude: ['node_modules', 'dist', 'dist-inline', 'scripts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: [
        'src/data/builders/**',
        'src/data/schema/**',
        'src/utils/**',
        'src/schema/**',
        'src/hooks/**',
        'src/features/dev/forms/rhf/**',
      ],
      exclude: [
        '**/*.d.ts',
        '**/index.ts',
        '**/*.test.{ts,tsx}',
        '**/types.ts',
      ],
      thresholds: {
        statements: 70,
        branches: 60,
        functions: 70,
        lines: 70,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@data': path.resolve(__dirname, './data'),
      '@content': path.resolve(__dirname, './content'),
      '@auth': path.resolve(__dirname, './lib/auth/authOptions.ts'),
      '@server': path.resolve(__dirname, './lib'),
      'server-only': path.resolve(__dirname, './src/test/server-only.ts'),
    },
  },
});
