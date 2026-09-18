import assert from 'node:assert/strict';
import test from 'node:test';
import { Linter } from 'eslint';
import guardrails from '../eslint-plugins/vercel-guardrails/index.js';

function lint(code, filename, rule, options = []) {
  const linter = new Linter({ cwd: '/repo' });
  return linter.verify(
    code,
    {
      files: ['**/*.{js,ts,tsx}'],
      languageOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      plugins: {
        'vercel-guardrails': guardrails,
      },
      rules: {
        [`vercel-guardrails/${rule}`]: ['error', ...options],
      },
    },
    { filename },
  );
}

test('Next environment access distinguishes public values from private and dynamic values', () => {
  const messages = lint(
    `
      process.env.NEXT_PUBLIC_SITE_FLAVOR;
      process.env["NEXT_PUBLIC_TURNSTILE_SITE_KEY"];
      process.env.NODE_ENV;
      process.env.AUTH_SECRET;
      process.env[envName];
      import.meta.env.NEXT_PUBLIC_SITE_FLAVOR;
    `,
    '/repo/src/config/runtime.ts',
    'enforce-env-prefix',
    [{ framework: 'next' }],
  );

  assert.deepEqual(messages.map(message => message.messageId), [
    'nextPrivateEnv',
    'nextDynamicEnv',
    'nextImportMetaEnv',
  ]);
});

test('Next server boundaries allow private environment access while client pages do not', () => {
  const serverCases = [
    ['/repo/src/app/api/example/route.ts', 'process.env.AUTH_SECRET;'],
    ['/repo/src/middleware.ts', 'process.env.AUTH_SECRET;'],
    ['/repo/src/app/example/page.tsx', 'process.env.AUTH_SECRET;'],
    ['/repo/src/lib/example.ts', `import 'server-only'; process.env.AUTH_SECRET;`],
    ['/repo/src/lib/example.test.ts', 'process.env.AUTH_SECRET;'],
  ];

  for (const [filename, code] of serverCases) {
    assert.equal(lint(code, filename, 'enforce-env-prefix', [{ framework: 'next' }]).length, 0);
  }

  const clientPage = lint(
    `'use client'; process.env.AUTH_SECRET;`,
    '/repo/src/app/example/page.tsx',
    'enforce-env-prefix',
    [{ framework: 'next' }],
  );
  assert.deepEqual(clientPage.map(message => message.messageId), ['nextPrivateEnv']);
});

test('the environment rule retains its Vite default contract', () => {
  assert.equal(
    lint('import.meta.env.VITE_API_URL;', '/repo/src/config/runtime.ts', 'enforce-env-prefix').length,
    0,
  );
  assert.deepEqual(
    lint('process.env.VITE_API_URL;', '/repo/src/config/runtime.ts', 'enforce-env-prefix').map(
      message => message.messageId,
    ),
    ['directProcessEnv'],
  );
});

test('a called relative App Router handler import is a delegated rate-limit boundary', () => {
  const messages = lint(
    `
      import { POST as submitProposal } from '../../route';
      export async function POST(request) {
        return submitProposal(request);
      }
    `,
    '/repo/src/app/api/dev/proposals/id/resubmit/route.ts',
    'require-rate-limit',
  );

  assert.equal(messages.length, 0);
});

test('an unguarded handler and an arbitrary same-named local call still require rate limiting', () => {
  const unguarded = lint(
    `export async function POST(request) { return new Response(request.url); }`,
    '/repo/src/app/api/example/route.ts',
    'require-rate-limit',
  );
  const localLookalike = lint(
    `
      function submitProposal(request) { return new Response(request.url); }
      export async function POST(request) { return submitProposal(request); }
    `,
    '/repo/src/app/api/example/route.ts',
    'require-rate-limit',
  );

  assert.deepEqual(unguarded.map(message => message.messageId), ['missingRateLimit']);
  assert.deepEqual(localLookalike.map(message => message.messageId), ['missingRateLimit']);
});
