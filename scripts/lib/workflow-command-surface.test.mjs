import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  validateDocumentedCommands,
  validateActiveScriptsDoNotUseRetiredArticleApi,
  validateDeprecatedScriptsAreFailClosed,
  validatePackageScriptTargets,
  validateStableWorkflowCommandImplementationPolicies,
  validateStableWorkflowCommandPolicies,
  validateStableWorkflowCommands,
} from './workflow-docs-consistency.mjs';
import { stableCitationWorkflowCommandNames } from './citation-command-surface.mjs';
import { stableWorkflowCommands } from './workflow-command-surface.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const packageJson = JSON.parse(
  readFileSync(resolve(repoRoot, 'package.json'), 'utf8'),
);

test('stable workflow command manifest entries are complete and backed by package scripts', () => {
  assert.deepEqual(validateStableWorkflowCommands(packageJson.scripts), []);
});

test('stable citation allowlist matches workflow command metadata', () => {
  const stableCitationCommands = stableWorkflowCommands.filter(({ name }) =>
    name.startsWith('citations:'));
  const stableCommandsByName = new Map(stableCitationCommands.map((command) => [command.name, command]));

  assert.deepEqual(
    stableCitationCommands.map(({ name }) => name),
    [...stableCitationWorkflowCommandNames],
  );
  const citationCommandsWithoutDirectDataOpsContext = new Set([
    'citations:campaign',
  ]);
  for (const commandName of stableCitationWorkflowCommandNames) {
    const command = stableCommandsByName.get(commandName);
    assert.ok(command, `${commandName} is missing from the stable workflow surface`);
    assert.equal(
      command.policy.dataOpsContext,
      citationCommandsWithoutDirectDataOpsContext.has(commandName) ? 'not-applicable' : 'required',
    );
  }

  const campaign = stableCommandsByName.get('citations:campaign');
  assert.equal(campaign.policy.dryRun, 'report-only');
  assert.equal(campaign.policy.productionWriteBoundary, null);
  assert.equal(campaign.policy.dataUrlPolicy, 'none');

  const seedSubsectionTracker = stableCommandsByName.get('citations:seed-subsection-tracker');
  assert.equal(seedSubsectionTracker.policy.dryRun, 'supported');
  assert.equal(seedSubsectionTracker.policy.productionWriteBoundary, null);
  assert.equal(seedSubsectionTracker.policy.dataUrlPolicy, 'none');

  const updateSubsectionStatus = stableCommandsByName.get('citations:update-subsection-status');
  assert.equal(updateSubsectionStatus.policy.dryRun, 'supported');
  assert.equal(updateSubsectionStatus.policy.productionWriteBoundary, null);
  assert.equal(updateSubsectionStatus.policy.dataUrlPolicy, 'none');

  for (const commandName of ['citations:formal', 'citations:apply-workbench']) {
    const command = stableCommandsByName.get(commandName);
    assert.equal(command.policy.dryRun, 'supported');
    assert.equal(command.policy.confirmationFlag, '--confirm-citation-write');
  }
});

test('batch proposal declares reads plus local artifacts without a Postgres write boundary', () => {
  const command = stableWorkflowCommands.find(({ name }) => name === 'batch:proposal');
  assert.ok(command, 'batch:proposal is missing from the stable workflow surface');
  assert.deepEqual(command.policy.reads.sort(), ['data-source', 'data-target', 'openrouter'].sort());
  assert.deepEqual(command.policy.writes, ['local-export-artifacts']);
  assert.equal(command.policy.confirmationFlag, null);
  assert.equal(command.policy.productionWriteBoundary, null);
});

test('batch proposal help loads through the stable Node CLI without generation', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/batch/generate-section-proposal.mjs', '--help'],
    { cwd: repoRoot, encoding: 'utf8' },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /section=<summary\|pharmacology>/);
  assert.match(result.stdout, /never accepts --write/);
});


test('stable workflow command policies are machine-readable', () => {
  assert.deepEqual(validateStableWorkflowCommandPolicies(packageJson.scripts), []);
});

test('stable workflow command implementations honor declared data-ops policies', () => {
  assert.deepEqual(validateStableWorkflowCommandImplementationPolicies(repoRoot, packageJson.scripts), []);
});

test('active scripts do not use retired article Postgres API namespace', () => {
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

