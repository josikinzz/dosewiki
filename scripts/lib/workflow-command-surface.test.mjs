import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateDocumentedCommands,
  validatePackageScriptTargets,
  validateStableWorkflowCommands,
  validateStableWorkflowDocCoverage,
  validateWorkflowEnvCoverage,
} from './workflow-docs-consistency.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const packageJson = JSON.parse(
  readFileSync(resolve(repoRoot, 'package.json'), 'utf8'),
);

test('stable workflow command manifest entries are complete and backed by package scripts', () => {
  assert.deepEqual(validateStableWorkflowCommands(packageJson.scripts), []);
});

test('package workflow script file targets exist', () => {
  assert.deepEqual(validatePackageScriptTargets(repoRoot, packageJson.scripts), []);
});

test('documented package commands and script paths resolve', () => {
  assert.deepEqual(validateDocumentedCommands(repoRoot, packageJson.scripts), []);
});

test('script inventory covers stable workflow package commands', () => {
  assert.deepEqual(validateStableWorkflowDocCoverage(repoRoot), []);
});

test('workflow docs and command metadata cover key environment variables', () => {
  assert.deepEqual(validateWorkflowEnvCoverage(repoRoot), []);
});
