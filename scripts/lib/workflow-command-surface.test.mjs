import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateDocumentedCommands,
  validateActiveScriptsDoNotUseRetiredArticleApi,
  validateDeprecatedScriptsAreFailClosed,
  validatePackageScriptTargets,
  validateStableWorkflowCommandImplementationPolicies,
  validateStableWorkflowCommandPolicies,
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

test('stable workflow command policies are machine-readable', () => {
  assert.deepEqual(validateStableWorkflowCommandPolicies(packageJson.scripts), []);
});

test('stable workflow command implementations honor declared data-ops policies', () => {
  assert.deepEqual(validateStableWorkflowCommandImplementationPolicies(repoRoot, packageJson.scripts), []);
});

test('active scripts do not use retired article Convex API namespace', () => {
  assert.deepEqual(validateActiveScriptsDoNotUseRetiredArticleApi(repoRoot, packageJson.scripts), []);
});

test('deprecated scripts are fail-closed and cannot mutate data', () => {
  assert.deepEqual(validateDeprecatedScriptsAreFailClosed(repoRoot), []);
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
