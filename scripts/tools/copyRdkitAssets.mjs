#!/usr/bin/env node
/* global console, process */
/**
 * Copy the RDKit.js MinimalLib runtime (loader + WASM) from the installed
 * `@rdkit/rdkit` package into `public/rdkit/` so it can be served as a static
 * asset and lazy-loaded by the `/dev` Molecule editor.
 *
 * The published loader uses two `new Function` code-generation paths from
 * Emscripten. Those paths are incompatible with the app's intentional CSP
 * prohibition on JavaScript `unsafe-eval`, so the copy step replaces them
 * with the equivalent generic invokers used by Emscripten when
 * `DYNAMIC_EXECUTION=0`.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const distDir = join(repoRoot, "node_modules", "@rdkit", "rdkit", "dist");
const outDir = join(repoRoot, "public", "rdkit");

const DYNAMIC_EMBIND_INVOKER =
  "function craftInvokerFunction(humanName,argTypes,classType,cppInvokerFunc,cppTargetFunc,isAsync){var argCount=argTypes.length;if(argCount<2){throwBindingError(\"argTypes array size mismatch! Must at least get return value and 'this' types!\")}var isClassMethodFunc=argTypes[1]!==null&&classType!==null;var needsDestructorStack=usesDestructorStack(argTypes);var returns=argTypes[0].name!==\"void\";var closureArgs=[humanName,throwBindingError,cppInvokerFunc,cppTargetFunc,runDestructors,argTypes[0],argTypes[1]];for(var i=0;i<argCount-2;++i){closureArgs.push(argTypes[i+2])}if(!needsDestructorStack){for(var i=isClassMethodFunc?1:2;i<argTypes.length;++i){if(argTypes[i].destructorFunction!==null){closureArgs.push(argTypes[i].destructorFunction)}}}let[args,invokerFnBody]=createJsInvoker(argTypes,isClassMethodFunc,returns,isAsync);var invokerFn=new Function(...args,invokerFnBody)(...closureArgs);return createNamedFunction(humanName,invokerFn)}";

const STATIC_EMBIND_INVOKER =
  "function craftInvokerFunction(humanName,argTypes,classType,cppInvokerFunc,cppTargetFunc,isAsync){var argCount=argTypes.length;if(argCount<2){throwBindingError(\"argTypes array size mismatch! Must at least get return value and 'this' types!\")}var isClassMethodFunc=argTypes[1]!==null&&classType!==null;var needsDestructorStack=usesDestructorStack(argTypes);var returns=argTypes[0].name!==\"void\";var expectedArgCount=argCount-2;var argsWired=new Array(expectedArgCount);var invokerFuncArgs=[];var destructors=[];var invokerFn=function(...args){destructors.length=0;var thisWired;invokerFuncArgs.length=isClassMethodFunc?2:1;invokerFuncArgs[0]=cppTargetFunc;if(isClassMethodFunc){thisWired=argTypes[1].toWireType(destructors,this);invokerFuncArgs[1]=thisWired}for(var i=0;i<expectedArgCount;++i){argsWired[i]=argTypes[i+2].toWireType(destructors,args[i]);invokerFuncArgs.push(argsWired[i])}var rv=cppInvokerFunc(...invokerFuncArgs);var onDone=function(value){if(needsDestructorStack){runDestructors(destructors)}else{for(var i=isClassMethodFunc?1:2;i<argTypes.length;++i){var param=i===1?thisWired:argsWired[i-2];if(argTypes[i].destructorFunction!==null){argTypes[i].destructorFunction(param)}}}if(returns){return argTypes[0].fromWireType(value)}};return isAsync?rv.then(onDone):onDone(rv)};return createNamedFunction(humanName,invokerFn)}";

const DYNAMIC_EMVAL_CALLER =
  'function __emval_get_method_caller(argCount,argTypes,kind){argTypes>>>=0;var types=emval_lookupTypes(argCount,argTypes);var retType=types.shift();argCount--;var functionBody=`return function (obj, func, destructorsRef, args) {\\n`;var offset=0;var argsList=[];if(kind===0){argsList.push("obj")}var params=["retType"];var args=[retType];for(var i=0;i<argCount;++i){argsList.push(`arg${i}`);params.push(`argType${i}`);args.push(types[i]);functionBody+=`  var arg${i} = argType${i}.readValueFromPointer(args${offset?"+"+offset:""});\\n`;offset+=types[i].argPackAdvance}var invoker=kind===1?"new func":"func.call";functionBody+=`  var rv = ${invoker}(${argsList.join(", ")});\\n`;if(!retType.isVoid){params.push("emval_returnValue");args.push(emval_returnValue);functionBody+="  return emval_returnValue(retType, destructorsRef, rv);\\n"}functionBody+="};\\n";var invokerFunction=new Function(...params,functionBody)(...args);var functionName=`methodCaller<(${types.map(t=>t.name).join(", ")}) => ${retType.name}>`;return emval_addMethodCaller(createNamedFunction(functionName,invokerFunction))}';

const STATIC_EMVAL_CALLER =
  'function __emval_get_method_caller(argCount,argTypes,kind){argTypes>>>=0;var types=emval_lookupTypes(argCount,argTypes);var retType=types.shift();argCount--;var invokerFunction=function(obj,func,destructorsRef,args){var values=new Array(argCount);var offset=0;for(var i=0;i<argCount;++i){values[i]=types[i].readValueFromPointer(args+offset);offset+=types[i].argPackAdvance}var rv=kind===1?Reflect.construct(func,values):func.call(obj,...values);if(!retType.isVoid){return emval_returnValue(retType,destructorsRef,rv)}};var functionName=`methodCaller<(${types.map(t=>t.name).join(", ")}) => ${retType.name}>`;return emval_addMethodCaller(createNamedFunction(functionName,invokerFunction))}';

export function makeLoaderCspCompatible(source) {
  if (!source.includes(DYNAMIC_EMBIND_INVOKER)) {
    throw new Error(
      "RDKit loader's Embind invoker changed; review the CSP transform before upgrading @rdkit/rdkit",
    );
  }
  if (!source.includes(DYNAMIC_EMVAL_CALLER)) {
    throw new Error(
      "RDKit loader's Emval caller changed; review the CSP transform before upgrading @rdkit/rdkit",
    );
  }

  const transformed = source
    .replace(DYNAMIC_EMBIND_INVOKER, STATIC_EMBIND_INVOKER)
    .replace(DYNAMIC_EMVAL_CALLER, STATIC_EMVAL_CALLER);

  if (/\b(?:eval|Function)\s*\(/u.test(transformed)) {
    throw new Error("RDKit loader still contains dynamic JavaScript execution");
  }
  return transformed;
}

function digest(content) {
  return createHash("sha256").update(content).digest("hex");
}

async function writeIfChanged(path, content) {
  try {
    if (digest(await readFile(path)) === digest(content)) return false;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await writeFile(path, content);
  return true;
}

export async function copyRdkitAssets() {
  await mkdir(outDir, { recursive: true });
  let copied = 0;

  try {
    const loader = await readFile(join(distDir, "RDKit_minimal.js"), "utf8");
    const wasm = await readFile(join(distDir, "RDKit_minimal.wasm"));
    copied += Number(
      await writeIfChanged(
        join(outDir, "RDKit_minimal.js"),
        makeLoaderCspCompatible(loader),
      ),
    );
    copied += Number(
      await writeIfChanged(join(outDir, "RDKit_minimal.wasm"), wasm),
    );
  } catch (error) {
    console.error(
      `[rdkit:assets] ${error?.message ?? error} - is @rdkit/rdkit installed?`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    copied === 0
      ? "[rdkit:assets] public/rdkit up to date"
      : `[rdkit:assets] copied ${copied} file(s) to public/rdkit`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await copyRdkitAssets();
}
