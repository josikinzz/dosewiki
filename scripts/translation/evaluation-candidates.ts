/** Read-only candidate packet. Sampling never creates adjudicated gold labels. */
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { parseArgs } from "node:util";
import { guardTarget } from "../postgres/targetGuard";

const {values}=parseArgs({options:{locale:{type:"string",default:"zh-Hans"},target:{type:"string"},"allow-remote":{type:"boolean",default:false},out:{type:"string"}}});
const target=values.target??process.env.TARGET_POSTGRES_URL;
if(!target)throw new Error("An explicit read target is required.");
guardTarget(target,values["allow-remote"]);
if(process.env.DATA_WRITES_FROZEN!=="1")throw new Error("Set DATA_WRITES_FROZEN=1 for candidate sampling.");
process.env.DATA_BACKEND="postgres";process.env.POSTGRES_POOLED_URL=target;delete process.env.POSTGRES_DIRECT_URL;
const {getPublicDataReadAdapter}=await import("../../lib/data/publicData.reads");
const {TRANSLATION_RECORD_KINDS,publicRecordSlugs,readTranslationRecord,segmentsOf}=await import("../../lib/translation/liveTranslation");
const {readTranslationCoverageRows}=await import("../../lib/translation/segmentStore");
const {resolveLocale}=await import("./locales.mjs");
resolveLocale(values.locale);
const reads=getPublicDataReadAdapter();
const candidates=[];
for(const kind of TRANSLATION_RECORD_KINDS){
 const slugs=(await publicRecordSlugs(reads,kind)).sort().slice(0,5);
 for(const slug of slugs){
  const record=await readTranslationRecord(reads,kind,slug);if(!record)continue;
  const segments=segmentsOf({...record,slug},kind);
  const prose=segments.filter(s=>s.words>=8).sort((a,b)=>(a.contextClass==="safety"?-1:0)-(b.contextClass==="safety"?-1:0)||a.path.localeCompare(b.path));
  const segment=prose[0]??segments[0];if(!segment)continue;
  const [machine]=await readTranslationCoverageRows(values.locale,[segment.hash]);
  const index=segments.indexOf(segment);
  candidates.push({id:createHash("sha256").update(JSON.stringify([kind,slug,segment.path,segment.hash])).digest("hex"),kind,slug,field:segment.path,source:segment.source,sourceHash:segment.hash,contextClass:segment.contextClass,context:{before:segments[index-1]?.source.slice(-2000)??null,after:segments[index+1]?.source.slice(0,2000)??null},target:machine?.target??null,model:machine?.model??null,promptVersion:machine?.prompt_version??null,adjudication:{status:"unreviewed",reviewer:null,acceptedTargets:[],category:null,severity:null,disposition:null,split:"unassigned"}});
 }
}
const version=createHash("sha256").update(JSON.stringify(candidates)).digest("hex");
const report={version,generatedAt:new Date().toISOString(),locale:values.locale,status:"candidates-only",sampling:"At most five records per public kind, sorted by slug; safety prose preferred. Not representative or adjudicated. Reviewers must add clean counterexamples, resolve missing targets and assign development/held-out splits.",candidates};
const out=values.out??`runs/translation/evaluation-candidates-${Date.now()}.json`;
await mkdir(path.dirname(out),{recursive:true});await writeFile(out,JSON.stringify(report,null,2),{flag:"wx"});
console.log(JSON.stringify({out,candidates:candidates.length,version,status:report.status}));
