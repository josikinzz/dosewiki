import { describe, it } from 'node:test';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import guardrails from './index.js';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
});

const devRoute = 'src/app/api/dev/example/route.ts';
const publicRoute = 'src/app/api/example-public/route.ts';
const exceptions = [{ route: publicRoute, methods: ['GET'], access: 'public' }];

ruleTester.run('require-route-access', guardrails.rules['require-route-access'], {
  valid: [
    {
      name: 'protectedRouteOperation with an inline auth floor',
      filename: devRoute,
      code: `
        import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
        export const POST = protectedRouteOperation({ auth: "editor", rateLimit: "editorSmallWrite", unexpectedErrorLabel: "x", operation: () => ok() });
      `,
    },
    {
      name: 'aliased wrapper import and a local export specifier',
      filename: devRoute,
      code: `
        import { protectedRouteOperation as guarded } from "@/lib/http/protectedRouteOperation";
        const handler = guarded({ auth: "admin", rateLimit: "editorSmallWrite", unexpectedErrorLabel: "x", operation: () => ok() });
        export { handler as PATCH };
      `,
    },
    {
      name: 'single-statement function that returns the wrapper for a dynamic segment',
      filename: devRoute,
      code: `
        import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
        export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
          return protectedRouteOperation({ auth: "editor", rateLimit: "editorSmallWrite", unexpectedErrorLabel: "x", operation: () => ok(context) })(request);
        }
      `,
    },
    {
      name: 'a forwarding function that passes only the request and route context',
      filename: devRoute,
      code: `
        import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
        const guarded = protectedRouteOperation({ auth: "editor", rateLimit: "editorSmallWrite", unexpectedErrorLabel: "x", operation: () => ok() });
        export async function POST(request: Request, context: unknown) {
          return guarded(request, context);
        }
        export const PUT = (request: Request) => guarded(request);
      `,
    },
    {
      name: 'fixed-floor factory and a host gate around a floored wrapper',
      filename: devRoute,
      code: `
        import { feedbackQueueRoute } from "@/lib/http/feedbackQueueRoute";
        import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
        import { replicationViewerEditorRoute } from "@server/next/replicationViewerEditorPolicy";
        export const GET = feedbackQueueRoute({ statuses: [] });
        export const PATCH = replicationViewerEditorRoute(protectedRouteOperation({ auth: "editor", rateLimit: "editorSmallWrite", unexpectedErrorLabel: "x", operation: () => ok() }));
      `,
    },
    {
      name: 'a factory imported from its canonical module by a relative path',
      filename: 'src/app/api/editor/example/route.ts',
      code: `
        import { editorReadRoute } from "../editorReadRoute";
        export const GET = editorReadRoute({ auth: "viewer", label: "example", read: async () => null });
      `,
    },
    {
      name: 'the test-env production gate around a floored wrapper',
      filename: 'src/app/api/test-env/route.ts',
      code: `
        import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
        import { testEnvRoute } from "./testEnvRoute";
        export const POST = testEnvRoute(protectedRouteOperation({ auth: "editor", rateLimit: "editorHeavyWrite", unexpectedErrorLabel: "x", operation: () => ok() }));
      `,
    },
    {
      name: 'a raw handler named in the method-specific exceptions',
      filename: publicRoute,
      options: [{ exceptions }],
      code: `
        export async function GET(request: Request) {
          return Response.json({ ok: true });
        }
      `,
    },
  ],
  invalid: [
    {
      name: 'a new raw POST in src/app/api/dev, even with a rate limiter',
      filename: devRoute,
      code: `
        import { enforceRateLimit } from "@server/http/nextRateLimit";
        export async function POST(request: Request) {
          const limited = await enforceRateLimit(request, "editorSmallWrite");
          if (limited) return limited;
          return Response.json({ ok: true });
        }
      `,
      errors: [{ messageId: 'unguardedHandler', data: { method: 'POST' } }],
    },
    {
      name: 'an unguarded extra method in an otherwise guarded module',
      filename: devRoute,
      code: `
        import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
        export const GET = protectedRouteOperation({ auth: "viewer", rateLimit: "editorPolledRead", unexpectedErrorLabel: "x", operation: () => ok() });
        export const DELETE = async (request: Request) => Response.json({ deleted: true });
      `,
      errors: [{ messageId: 'unguardedHandler', data: { method: 'DELETE' } }],
    },
    {
      name: 'a wrapper call with no auth floor',
      filename: devRoute,
      code: `
        import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
        const options = { auth: "editor" };
        export const POST = protectedRouteOperation({ rateLimit: "editorSmallWrite", unexpectedErrorLabel: "x", operation: () => ok() });
        export const PUT = protectedRouteOperation(options);
      `,
      errors: [
        { messageId: 'missingFloor', data: { factory: 'protectedRouteOperation' } },
        { messageId: 'missingFloor', data: { factory: 'protectedRouteOperation' } },
      ],
    },
    {
      name: 'a fixed-floor factory name exported by an unrelated module',
      filename: devRoute,
      code: `
        import { feedbackQueueRoute } from "./fake";
        export const POST = feedbackQueueRoute(async () => Response.json({ ok: true }));
      `,
      errors: [{ messageId: 'unguardedHandler', data: { method: 'POST' } }],
    },
    {
      name: 'protectedRouteOperation exported by an unrelated module, even with an auth option',
      filename: devRoute,
      code: `
        import { protectedRouteOperation } from "@/lib/http/fakeProtectedRouteOperation";
        export const POST = protectedRouteOperation({ auth: "editor", rateLimit: "editorSmallWrite", unexpectedErrorLabel: "x", operation: () => ok() });
      `,
      errors: [{ messageId: 'unguardedHandler', data: { method: 'POST' } }],
    },
    {
      name: 'a canonical factory name imported from the wrong canonical module',
      filename: devRoute,
      code: `
        import { protectedRouteOperation } from "@/lib/http/feedbackQueueRoute";
        export const POST = protectedRouteOperation({ auth: "editor", rateLimit: "editorSmallWrite", unexpectedErrorLabel: "x", operation: () => ok() });
      `,
      errors: [{ messageId: 'unguardedHandler', data: { method: 'POST' } }],
    },
    ...[
      ['an awaited call', 'guarded(await doWrite(request))'],
      ['a sequence expression', 'guarded((await doWriteBeforeAuth(), request))'],
      ['a plain call', 'guarded(parseBody(request))'],
      ['an assignment', 'guarded(request = new Request("https://example.test"))'],
      ['a method call on the request', 'guarded(request.clone())'],
      ['arguments in the wrong order', 'guarded(context, request)'],
      ['work in the inline wrapper options', 'protectedRouteOperation({ auth: "editor", rateLimit: await pickLimit(request), unexpectedErrorLabel: "x", operation: () => ok() })(request)'],
      ['a getter in the inline wrapper options', 'protectedRouteOperation({ auth: "editor", get rateLimit() { return pickLimit(request); }, unexpectedErrorLabel: "x", operation: () => ok() })(request)'],
      ['a spread in the inline wrapper options', 'protectedRouteOperation({ ...readOptions(request), auth: "editor" })(request)'],
    ].map(([shape, call]) => ({
      name: `a forwarding function that does work through ${shape}`,
      filename: devRoute,
      code: `
        import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
        const guarded = protectedRouteOperation({ auth: "editor", rateLimit: "editorSmallWrite", unexpectedErrorLabel: "x", operation: () => ok() });
        export async function POST(request: Request, context: unknown) {
          return ${call};
        }
      `,
      errors: [{ messageId: 'unguardedHandler', data: { method: 'POST' } }],
    })),
    {
      name: 'a forwarding function whose parameter shadows the wrapper',
      filename: devRoute,
      code: `
        import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
        export async function POST(request: Request, protectedRouteOperation: (options: unknown) => (request: Request) => Response) {
          return protectedRouteOperation({ auth: "editor", rateLimit: "editorSmallWrite", unexpectedErrorLabel: "x", operation: () => ok() })(request);
        }
      `,
      errors: [{ messageId: 'unguardedHandler', data: { method: 'POST' } }],
    },
    ...[
      ['an uninitialized export assigned later', `
        export let POST;
        POST = async () => Response.json({ ok: true });
      `],
      ['a destructured export', `
        export const { POST } = { POST: async () => Response.json({ ok: true }) };
      `],
      ['a guarded let export reassigned to a raw handler', `
        import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
        export let POST = protectedRouteOperation({ auth: "editor", rateLimit: "editorSmallWrite", unexpectedErrorLabel: "x", operation: () => ok() });
        POST = async () => Response.json({ ok: true });
      `],
      ['a guarded var export with no reassignment', `
        import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
        export var POST = protectedRouteOperation({ auth: "editor", rateLimit: "editorSmallWrite", unexpectedErrorLabel: "x", operation: () => ok() });
      `],
      ['a guarded function declaration reassigned to a raw handler', `
        import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
        const guarded = protectedRouteOperation({ auth: "editor", rateLimit: "editorSmallWrite", unexpectedErrorLabel: "x", operation: () => ok() });
        export function POST(request: Request) { return guarded(request); }
        POST = async () => Response.json({ ok: true });
      `],
      ['an export list naming a let reassigned inside a function', `
        import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
        let handler = protectedRouteOperation({ auth: "editor", rateLimit: "editorSmallWrite", unexpectedErrorLabel: "x", operation: () => ok() });
        function swap() { handler = async () => Response.json({ ok: true }); }
        export { handler as POST };
      `],
      ['a forwarding function whose guard binding is a let', `
        import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
        let guarded = protectedRouteOperation({ auth: "editor", rateLimit: "editorSmallWrite", unexpectedErrorLabel: "x", operation: () => ok() });
        export const POST = (request: Request) => guarded(request);
      `],
      ['a class export', `
        export class POST {}
      `],
    ].map(([shape, code]) => ({
      name: `${shape} is rejected`,
      filename: devRoute,
      code,
      errors: [{ messageId: 'unsupportedBinding', data: { method: 'POST' } }],
    })),
    {
      name: 'the test-env production gate around a raw handler',
      filename: 'src/app/api/test-env/route.ts',
      code: `
        import { testEnvRoute } from "./testEnvRoute";
        export const POST = testEnvRoute(async () => Response.json({ privateData: true }));
      `,
      errors: [{ messageId: 'unguardedHandler', data: { method: 'POST' } }],
    },
    {
      name: 'a host gate around a raw handler',
      filename: devRoute,
      code: `
        import { replicationViewerEditorRoute } from "@server/next/replicationViewerEditorPolicy";
        export const PATCH = replicationViewerEditorRoute(async () => Response.json({ ok: true }));
      `,
      errors: [{ messageId: 'unguardedHandler', data: { method: 'PATCH' } }],
    },
    {
      name: 'an exception only covers the methods it names',
      filename: publicRoute,
      options: [{ exceptions }],
      code: `
        export async function GET() { return Response.json({ ok: true }); }
        export async function POST() { return Response.json({ ok: true }); }
      `,
      errors: [{ messageId: 'unguardedHandler', data: { method: 'POST' } }],
    },
    {
      name: 'an exception for a handler that is now guarded is stale',
      filename: publicRoute,
      options: [{ exceptions }],
      code: `
        import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
        export const GET = protectedRouteOperation({ auth: "viewer", rateLimit: "editorPolledRead", unexpectedErrorLabel: "x", operation: () => ok() });
      `,
      errors: [{ messageId: 'staleException', data: { method: 'GET' } }],
    },
  ],
});
