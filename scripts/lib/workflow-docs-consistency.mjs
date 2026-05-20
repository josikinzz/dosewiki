import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  stableWorkflowCommands,
  stableWorkflowCommandNames,
} from './workflow-command-surface.mjs';

export const workflowDocsToCheck = [
  'README.md',
  'CLAUDE.md',
  'AGENTS.md',
  'scripts/README.md',
  'docs/architecture/project-layout.md',
];

export const workflowEnvVars = [
  'CONVEX_ADMIN_KEY',
  'OPENROUTER_API_KEY',
  'VITE_CONVEX_URL',
  'CONVEX_PUBLIC_READ_URL',
  'TARGET_CONVEX_URL',
];

export const workflowEnvDocsToCheck = [
  'README.md',
  'CLAUDE.md',
  'AGENTS.md',
  'scripts/README.md',
];

export const stableWorkflowInventoryDocs = ['scripts/README.md'];

export function cleanCommandToken(value) {
  return value.replace(/[),.;:]+$/g, '');
}

export function extractPackageCommands(content) {
  const commands = [];
  const pattern = /\bnpm run ([a-z0-9:_-]+)/g;
  for (const match of content.matchAll(pattern)) {
    commands.push(cleanCommandToken(match[1]));
  }
  return commands;
}

export function extractScriptPaths(command) {
  const paths = [];
  const pattern = /(?:^|\s)(?:node|bun|tsx|ts-node)(?:\s+--[^\s]+)*\s+(scripts\/[^\s'"`)]+?\.(?:mjs|ts|js|cjs))/g;
  for (const match of command.matchAll(pattern)) {
    paths.push(cleanCommandToken(match[1]));
  }
  return paths;
}

export function extractEnvVars(content) {
  return [...new Set(content.match(/\b[A-Z][A-Z0-9_]{2,}\b/g) ?? [])];
}

export function pathPatternExists(repoRoot, packageScripts, pathPattern) {
  if (!pathPattern.includes('*') && !pathPattern.includes('{')) {
    return existsSync(resolve(repoRoot, pathPattern));
  }

  const normalizedPattern = pathPattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\\*/g, '[^/]*')
    .replace(/\\\{[^/]+\\\}/g, '[^/]+');
  const regex = new RegExp(`^${normalizedPattern}$`);

  return Object.values(packageScripts)
    .flatMap(extractScriptPaths)
    .some((scriptPath) => regex.test(scriptPath) && existsSync(resolve(repoRoot, scriptPath)));
}

export function validateStableWorkflowCommands(packageScripts) {
  const failures = [];

  for (const command of stableWorkflowCommands) {
    if (typeof command.name !== 'string') {
      failures.push(`${command.name}: missing name`);
    }
    if (!packageScripts[command.name]) {
      failures.push(`${command.name}: missing package.json script`);
    }
    if (!command.purpose) {
      failures.push(`${command.name}: missing purpose`);
    }
    if (!Array.isArray(command.env)) {
      failures.push(`${command.name}: env must be an array`);
    }
    if (!command.readWrite) {
      failures.push(`${command.name}: missing read/write policy`);
    }
    if (!command.dryRun) {
      failures.push(`${command.name}: missing dry-run policy`);
    }
    if (!command.productionImpact) {
      failures.push(`${command.name}: missing production impact`);
    }
  }

  if (new Set(stableWorkflowCommandNames).size !== stableWorkflowCommandNames.length) {
    failures.push('stable workflow command names must be unique');
  }

  return failures;
}

export function validatePackageScriptTargets(repoRoot, packageScripts) {
  const failures = [];

  for (const [name, command] of Object.entries(packageScripts)) {
    for (const scriptPath of extractScriptPaths(command)) {
      if (!existsSync(resolve(repoRoot, scriptPath))) {
        failures.push(`${name}: ${scriptPath}`);
      }
    }
  }

  return failures;
}

export function validateDocumentedCommands(repoRoot, packageScripts, docPaths = workflowDocsToCheck) {
  const failures = [];

  for (const docPath of docPaths) {
    const content = readFileSync(resolve(repoRoot, docPath), 'utf8');

    for (const commandName of extractPackageCommands(content)) {
      if (!packageScripts[commandName]) {
        failures.push(`${docPath}: npm run ${commandName}`);
      }
    }

    for (const scriptPath of extractScriptPaths(content)) {
      if (!pathPatternExists(repoRoot, packageScripts, scriptPath)) {
        failures.push(`${docPath}: ${scriptPath}`);
      }
    }
  }

  return failures;
}

export function validateStableWorkflowDocCoverage(repoRoot, docPaths = stableWorkflowInventoryDocs) {
  const failures = [];

  for (const docPath of docPaths) {
    const content = readFileSync(resolve(repoRoot, docPath), 'utf8');
    for (const commandName of stableWorkflowCommandNames) {
      if (!content.includes(`npm run ${commandName}`) && !content.includes(`\`${commandName}\``)) {
        failures.push(`${docPath}: missing stable workflow command ${commandName}`);
      }
    }
  }

  return failures;
}

export function validateWorkflowEnvCoverage(repoRoot, docPaths = workflowEnvDocsToCheck) {
  const failures = [];
  const metadataEnvVars = new Set(extractEnvVars(stableWorkflowCommands.flatMap((command) => command.env).join('\n')));

  for (const envVar of workflowEnvVars) {
    if (!metadataEnvVars.has(envVar)) {
      failures.push(`workflow metadata: missing ${envVar}`);
    }
  }

  for (const docPath of docPaths) {
    const contentEnvVars = new Set(extractEnvVars(readFileSync(resolve(repoRoot, docPath), 'utf8')));
    for (const envVar of workflowEnvVars) {
      if (!contentEnvVars.has(envVar)) {
        failures.push(`${docPath}: missing workflow env var ${envVar}`);
      }
    }
  }

  return failures;
}
