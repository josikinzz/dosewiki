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
