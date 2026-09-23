import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { catalogCheckpointIdentity, openCatalogCheckpoint } from './catalog-checkpoint.mjs';
test('checkpoint identity changes with effective prompt inputs', () => {
 const inputs={kinds:{Light:'register'},glossary:{Light:'轻度'},model:'model-a'};
 const identity=catalogCheckpointIdentity(inputs);
 assert.equal(catalogCheckpointIdentity(inputs),identity);
 assert.notEqual(catalogCheckpointIdentity({...inputs,kinds:{Light:'appearance'}}),identity);
 assert.notEqual(catalogCheckpointIdentity({...inputs,glossary:{Light:'浅色'}}),identity);
 assert.notEqual(catalogCheckpointIdentity({...inputs,model:'model-b'}),identity);
});
test('resumes accepted units only under the exact input identity',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'catalog-checkpoint-'));
 try {
  const file=path.join(dir,'checkpoint.jsonl');const c=await openCatalogCheckpoint(file,'snapshot');
  await c.append({key:'key',source:'Source',target:'译文',defects:[]});
  await c.append({key:'bad',source:'Bad',target:'錯',defects:['SCRIPT_LEAK']});
  const resumed=await openCatalogCheckpoint(file,'snapshot');
  assert.equal(resumed.targets.get('key')?.target,'译文');assert.equal(resumed.targets.has('bad'),false);
  await assert.rejects(openCatalogCheckpoint(file,'different'),/identity/);
  assert.match(await readFile(file,'utf8'),/SCRIPT_LEAK/);
 } finally {await rm(dir,{recursive:true,force:true});}
});
