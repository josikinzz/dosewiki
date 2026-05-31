import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import {
  stableWorkflowCommands,
  stableWorkflowCommandNames,
  workflowAccessTargets,
  workflowConvexUrlPolicies,
  workflowDataOpsContextPolicies,
  workflowDryRunPolicies,
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

const scriptSourceExtensions = new Set(['.cjs', '.js', '.mjs', '.ts', '.tsx']);

const retiredArticleApiNamespace = ['api', 'articles'].join('.');
const activeScriptRetiredApiPattern = new RegExp(`\\b${retiredArticleApiNamespace.replace('.', '\\.')}\\b`);

const deprecatedScriptForbiddenPatterns = [
  {
    label: 'filesystem writes',
    pattern: /\b(?:writeFile|writeFileSync|appendFile|appendFileSync|rm|rmSync|unlink|unlinkSync|mkdir|mkdirSync)\b/,
  },
  {
    label: 'Convex clients',
    pattern: /\bConvexHttpClient\b|\bconvex\/browser\b/,
  },
  {
    label: 'network writes',
    pattern: /\bfetch\s*\(|\baxios\b|\bgot\s*\(|\bky\s*\(/,
  },
  {
    label: 'local data artifact mutation',
    pattern: /\b(?:SubstanceIndex\.json|src\/data|public\/)\b/,
  },
];

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

function walkScriptFiles(repoRoot, relativeDir, files = []) {
  const absoluteDir = resolve(repoRoot, relativeDir);
  if (!existsSync(absoluteDir)) {
    return files;
  }

  for (const entry of readdirSync(absoluteDir)) {
    const relativePath = `${relativeDir}/${entry}`;
    const absolutePath = resolve(repoRoot, relativePath);
    const stats = statSync(absolutePath);

    if (stats.isDirectory()) {
      walkScriptFiles(repoRoot, relativePath, files);
      continue;
    }

    if (scriptSourceExtensions.has(extname(entry))) {
      files.push(relativePath);
    }
  }

  return files.sort();
}

function activeScriptPaths(repoRoot, packageScripts) {
  const paths = new Set(
    walkScriptFiles(repoRoot, 'scripts').filter((scriptPath) => !scriptPath.startsWith('scripts/deprecated/')),
  );

  for (const command of Object.values(packageScripts)) {
    for (const scriptPath of extractScriptPaths(command)) {
      if (scriptPath.startsWith('scripts/') && !scriptPath.startsWith('scripts/deprecated/')) {
        paths.add(scriptPath);
      }
    }
  }

  return [...paths].sort();
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
    if (!command.policy) {
      failures.push(`${command.name}: missing machine-readable policy`);
    }
  }

  if (new Set(stableWorkflowCommandNames).size !== stableWorkflowCommandNames.length) {
    failures.push('stable workflow command names must be unique');
  }

  return failures;
}

function isOneOf(value, allowedValues) {
  return Object.values(allowedValues).includes(value);
}

function validateAccessList(commandName, fieldName, values) {
  if (!Array.isArray(values)) {
    return [`${commandName}: policy.${fieldName} must be an array`];
  }

  const allowedTargets = new Set(Object.values(workflowAccessTargets));
  return values
    .filter((value) => !allowedTargets.has(value))
    .map((value) => `${commandName}: policy.${fieldName} includes unknown target ${value}`);
}

function packageScriptPathForCommand(packageScripts, command) {
  return extractScriptPaths(packageScripts[command.name] ?? '')[0] ?? null;
}

function isDataOpsScriptPath(scriptPath) {
  return [
    'scripts/citations/',
    'scripts/convex/',
    'scripts/migrate/',
    'scripts/prepopulate/',
  ].some((prefix) => scriptPath.startsWith(prefix));
}

export function validateStableWorkflowCommandPolicies(packageScripts) {
  const failures = [];

  for (const command of stableWorkflowCommands) {
    const policy = command.policy;
    if (!policy || typeof policy !== 'object') {
      failures.push(`${command.name}: missing machine-readable policy`);
      continue;
    }

    if ('readWrite' in command || 'dryRun' in command || 'productionImpact' in command) {
      failures.push(`${command.name}: safety policy must use typed policy fields, not prose metadata`);
    }

    const packageScriptPath = packageScriptPathForCommand(packageScripts, command);
    if (typeof policy.scriptPath !== 'string' || policy.scriptPath.length === 0) {
      failures.push(`${command.name}: policy.scriptPath is required`);
    } else if (packageScriptPath && policy.scriptPath !== packageScriptPath) {
      failures.push(`${command.name}: policy.scriptPath ${policy.scriptPath} does not match package script ${packageScriptPath}`);
    }

    failures.push(...validateAccessList(command.name, 'reads', policy.reads));
    failures.push(...validateAccessList(command.name, 'writes', policy.writes));

    if (!isOneOf(policy.dryRun, workflowDryRunPolicies)) {
      failures.push(`${command.name}: policy.dryRun must be one of ${Object.values(workflowDryRunPolicies).join(', ')}`);
    }

    if (!isOneOf(policy.dataOpsContext, workflowDataOpsContextPolicies)) {
      failures.push(`${command.name}: policy.dataOpsContext must be one of ${Object.values(workflowDataOpsContextPolicies).join(', ')}`);
    }

    if (!isOneOf(policy.convexUrlPolicy, workflowConvexUrlPolicies)) {
      failures.push(`${command.name}: policy.convexUrlPolicy must be one of ${Object.values(workflowConvexUrlPolicies).join(', ')}`);
    }

    if (policy.writes.length > 0 && policy.dryRun === workflowDryRunPolicies.readOnly) {
      failures.push(`${command.name}: write-capable command cannot declare read-only dry-run policy`);
    }

    if (
      policy.writes.includes(workflowAccessTargets.convexTarget) &&
      policy.convexUrlPolicy === workflowConvexUrlPolicies.none
    ) {
      failures.push(`${command.name}: Convex write command must declare a Convex URL policy`);
    }

    if (
      typeof policy.scriptPath === 'string' &&
      isDataOpsScriptPath(policy.scriptPath) &&
      policy.dataOpsContext !== workflowDataOpsContextPolicies.required
    ) {
      failures.push(`${command.name}: stable data-operation scripts must require shared data-ops context`);
    }

    if (policy.confirmationFlag !== null && typeof policy.confirmationFlag !== 'string') {
      failures.push(`${command.name}: policy.confirmationFlag must be null or a flag string`);
    }
  }

  return failures;
}

const rawConvexFallbackPattern =
  /process\.env\.(?:TARGET_CONVEX_URL|CONVEX_URL|VITE_CONVEX_URL|NEXT_PUBLIC_CONVEX_URL)\s*\|\|\s*process\.env\.(?:TARGET_CONVEX_URL|CONVEX_URL|VITE_CONVEX_URL|NEXT_PUBLIC_CONVEX_URL)/;

export function validateStableWorkflowCommandImplementationPolicies(repoRoot, packageScripts) {
  const failures = [];

  for (const command of stableWorkflowCommands) {
    const policy = command.policy;
    if (!policy?.scriptPath) {
      continue;
    }

    const scriptPath = packageScriptPathForCommand(packageScripts, command) ?? policy.scriptPath;
    const absoluteScriptPath = resolve(repoRoot, scriptPath);
    if (!existsSync(absoluteScriptPath)) {
      continue;
    }

    const content = readFileSync(absoluteScriptPath, 'utf8');
    if (policy.dataOpsContext === workflowDataOpsContextPolicies.required) {
      if (!content.includes('data-ops-run-context.mjs') || !content.includes('createDataOpsRunContext')) {
        failures.push(`${command.name}: ${scriptPath} must use scripts/lib/data-ops-run-context.mjs`);
      }

      if (rawConvexFallbackPattern.test(content)) {
        failures.push(`${command.name}: ${scriptPath} must not resolve Convex targets with raw process.env fallbacks`);
      }
    }
  }

  return failures;
}

export function validateActiveScriptsDoNotUseRetiredArticleApi(repoRoot, packageScripts) {
  const failures = [];

  for (const scriptPath of activeScriptPaths(repoRoot, packageScripts)) {
    const absoluteScriptPath = resolve(repoRoot, scriptPath);
    if (!existsSync(absoluteScriptPath)) {
      continue;
    }

    const content = readFileSync(absoluteScriptPath, 'utf8');
    if (activeScriptRetiredApiPattern.test(content)) {
      failures.push(`${scriptPath}: uses retired ${retiredArticleApiNamespace} namespace`);
    }
  }

  return failures;
}

export function validateDeprecatedScriptsAreFailClosed(repoRoot) {
  const failures = [];

  for (const scriptPath of walkScriptFiles(repoRoot, 'scripts/deprecated')) {
    const content = readFileSync(resolve(repoRoot, scriptPath), 'utf8');
    for (const { label, pattern } of deprecatedScriptForbiddenPatterns) {
      if (pattern.test(content)) {
        failures.push(`${scriptPath}: contains ${label}`);
      }
    }
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
