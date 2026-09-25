import assert from "node:assert/strict";
import { test } from "node:test";
import { Linter } from "eslint";
import tseslint from "typescript-eslint";
import editorGuardrails from "./index.js";

const RULE = "editor-guardrails/use-shared-guard-and-confirm";

function findings(code, filename = "src/features/dev/tools/example/ExampleTab.tsx") {
  const linter = new Linter({ configType: "flat" });
  return linter
    .verify(
      code,
      [
        {
          files: ["**/*.{js,jsx,ts,tsx}"],
          languageOptions: {
            parser: tseslint.parser,
            parserOptions: { ecmaFeatures: { jsx: true } },
          },
          plugins: { "editor-guardrails": editorGuardrails },
          rules: { [RULE]: "error" },
        },
      ],
      { filename },
    )
    .map((message) => {
      assert.equal(message.ruleId, RULE, message.message);
      return message.messageId;
    });
}

test("a beforeunload listener names the shared unsaved-work guard", () => {
  for (const code of [
    'window.addEventListener("beforeunload", warn);',
    "globalThis.addEventListener('beforeunload', warn, { capture: true });",
    "window.addEventListener(`beforeunload`, warn);",
  ]) {
    assert.deepEqual(findings(code), ["beforeUnload"], code);
  }
  const linter = new Linter({ configType: "flat" });
  const [message] = linter.verify('window.addEventListener("beforeunload", warn);', [
    { plugins: { "editor-guardrails": editorGuardrails }, rules: { [RULE]: "error" } },
  ]);
  assert.match(message.message, /useUnsavedWork/);
  assert.match(message.message, /useDirtyGuard/);
});

test("an onbeforeunload handler is banned", () => {
  assert.deepEqual(findings("window.onbeforeunload = () => true;"), ["beforeUnload"]);
  assert.deepEqual(findings("window['onbeforeunload'] = null;"), ["beforeUnload"]);
});

test("other listeners and removing a listener are allowed", () => {
  assert.deepEqual(findings('window.addEventListener("popstate", onPop);'), []);
  assert.deepEqual(findings('window.removeEventListener("beforeunload", warn);'), []);
});

test("the native confirm is banned in every spelling", () => {
  for (const code of [
    'if (!window.confirm("Remove?")) return;',
    'globalThis.confirm("Remove?");',
    'window["confirm"]("Remove?");',
    'if (confirm("Remove?")) remove();',
  ]) {
    assert.deepEqual(findings(code), ["nativeConfirm"], code);
  }
});

test("a confirm from useConfirm or a parameter is the shared dialog, not the native one", () => {
  assert.deepEqual(
    findings(`
      function Tab() {
        const { confirm, dialog } = useConfirm();
        confirm({ title: "Remove?", description: "", onConfirm: () => {} });
        return dialog;
      }
    `),
    [],
  );
  assert.deepEqual(findings("const ask = (confirm) => confirm({ title: 'Remove?' });"), []);
  assert.deepEqual(findings("controller.confirm();"), []);
});

test("a Dialog whose title asks a question is a hand-built confirmation", () => {
  const cases = [
    `import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
     const a = <Dialog><DialogContent><DialogTitle>Discard unsaved changes?</DialogTitle></DialogContent></Dialog>;`,
    `import { DialogTitle as Heading } from "@/components/ui/dialog";
     const a = <Heading>Delete {name}?</Heading>;`,
    `import { DialogTitle } from "@/components/ui/dialog";
     const a = <DialogTitle>{\`Replace stages for \${name}?\`}</DialogTitle>;`,
    `import * as DialogPrimitive from "@radix-ui/react-dialog";
     const a = <DialogPrimitive.Title>Keep your edits?</DialogPrimitive.Title>;`,
  ];
  for (const code of cases) assert.deepEqual(findings(code), ["confirmDialog"], code);
});

test("a Dialog that is a form, drawer or sheet is not a confirmation", () => {
  const cases = [
    `import { DialogTitle } from "@/components/ui/dialog";
     const a = <DialogTitle>Category name and icon</DialogTitle>;`,
    `import { DialogTitle } from "@/components/ui/dialog";
     const a = <DialogTitle>{title}</DialogTitle>;`,
    `import { DialogTitle } from "@/components/ui/dialog";
     const a = <DialogTitle>Edit {label}</DialogTitle>;`,
    // A title that asks but is not a Dialog title is out of scope.
    `const a = <h2>Discard changes?</h2>;`,
    `import { DialogTitle } from "./local";
     const a = <DialogTitle>Discard changes?</DialogTitle>;`,
  ];
  for (const code of cases) assert.deepEqual(findings(code), [], code);
});

test("the AlertDialog primitive is banned outright", () => {
  assert.deepEqual(findings('import { AlertDialog } from "@radix-ui/react-alert-dialog";'), ["alertDialog"]);
  assert.deepEqual(findings('import * as AlertDialog from "@/components/ui/alert-dialog";'), ["alertDialog"]);
});

test("every message names the shared replacement", () => {
  const { messages } = editorGuardrails.rules["use-shared-guard-and-confirm"].meta;
  for (const [id, text] of Object.entries(messages)) {
    assert.match(text, /useUnsavedWork|useConfirm|ConfirmDialog/, id);
  }
});
