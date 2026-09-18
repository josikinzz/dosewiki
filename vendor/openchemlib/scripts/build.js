import childProcess from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import exporter from 'gwt-api-exporter';
import yargs from 'yargs';

import pack from '../package.json' with { type: 'json' };

const argv = yargs(process.argv.slice(2))
  .command('build', 'Compile and export')
  .command('compile', 'Execute the GWT compiler.')
  .command('export', 'Transform the GWT compiled files to a JavaScript module.')
  .demandCommand()
  .option('v', {
    alias: 'verbose',
    default: false,
    type: 'boolean',
  })
  .option('mode', {
    description: 'Compilation mode',
    choices: ['pretty', 'min'],
    default: 'pretty',
  })
  .option('s', {
    alias: 'suffix',
    description: 'Optional suffix to the exported filename',
  }).argv;

const { mode, verbose, _ } = argv;

let suffix = '';
if (argv.suffix) {
  suffix = `.${argv.suffix}`;
}

let fileConfig = {};
try {
  const cfgJson = await import('../config.json', { with: { type: 'json' } });
  fileConfig = cfgJson.default;
} catch {
  // The DoseWiki fork keeps machine-specific tool paths out of tracked files.
}

const localJdkRoot = path.join(import.meta.dirname, '../.tools/jdk');
const localJdkHome = fs.existsSync(path.join(localJdkRoot, 'Contents/Home/bin/java'))
  ? path.join(localJdkRoot, 'Contents/Home')
  : localJdkRoot;
const config = {
  gwt:
    process.env.GWT_HOME ||
    fileConfig.gwt ||
    path.join(import.meta.dirname, '../.tools/gwt'),
  jdk: process.env.JAVA_HOME || fileConfig.jdk || localJdkHome,
};

for (const jar of ['gwt-dev.jar', 'gwt-user.jar']) {
  if (!fs.existsSync(path.resolve(config.gwt, jar))) {
    throw new Error(
      `Missing ${jar}. Set GWT_HOME or extract GWT into .tools/gwt.`,
    );
  }
}

const classpathList = [
  'src',
  path.resolve(config.gwt, 'gwt-dev.jar'),
  path.resolve(config.gwt, 'gwt-user.jar'),
];

const sep = os.platform() === 'win32' ? ';' : ':';
const classpath = classpathList.join(sep);

run(_[0]);

function run(command) {
  if (command === 'compile') {
    compile(mode);
  } else if (command === 'export') {
    build().catch(handleCatch);
  } else if (command === 'build') {
    compile(mode);
    build().catch(handleCatch);
  }
}

function compile(mode) {
  let min = mode === 'min';
  let PATH = process.env.PATH;
  if (config.jdk) {
    PATH = `${path.resolve(config.jdk, 'bin')}${sep}${PATH}`;
  }
  log('Compiling module');
  let args = [
    '-Xmx2G',
    '-cp',
    classpath,
    'com.google.gwt.dev.Compiler',
    'com.actelion.research.gwt.Js',
    '-logLevel',
    verbose ? 'DEBUG' : 'ERROR',
    min ? '-XnocheckCasts' : '-XcheckCasts',
    '-XnoclassMetadata',
    verbose ? '-draftCompile' : '-nodraftCompile',
    '-nocheckAssertions',
    '-generateJsInteropExports',
    '-optimize',
    min ? '9' : '0',
    '-style',
    min ? 'OBFUSCATED' : 'PRETTY',
    '-sourceLevel',
    '17',
    '-failOnError',
  ];
  let result;
  try {
    result = childProcess.execFileSync('java', args, {
      maxBuffer: Infinity,
      env: { ...process.env, PATH },
    });
  } catch (error) {
    result = error.stdout;
    throw error;
  } finally {
    if (verbose) {
      let name = `compile${suffix}.log`;
      log(`Compilation log written to ${name}`);
      fs.writeFileSync(`./${name}`, result);
    }
  }
}

async function build() {
  let prom = [];
  fs.mkdirSync('lib/java', { recursive: true });
  log('Exporting module');
  let warDir = path.join('war', 'oclJs');
  let files = fs.readdirSync(warDir);
  let file;
  for (let i = 0; i < files.length; i++) {
    if (files[i].indexOf('.cache.js') > 0) {
      file = path.join(warDir, files[i]);
      break;
    }
  }
  if (!file) {
    throw new Error('Could not find GWT file for module oclJs');
  }
  prom.push(
    exporter({
      input: file,
      output: `lib/java/openchemlib${suffix}.js`,
      exports: 'OCL',
      fake: true,
      package: pack,
    }),
  );
  await Promise.all(prom);
}

function log(value) {
  if (verbose) {
    // eslint-disable-next-line no-console
    console.log(value);
  }
}

function handleCatch(err) {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
}
