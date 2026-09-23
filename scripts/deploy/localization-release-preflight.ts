/** One-off build preflight. Run with Bun from the staged release root.
 * Uses only the project's runtime pooled credential. No database mutations.
 * Never import this script from application code.
 */
import pg from 'pg';

const editor: Record<string, string[]> = {
  translationGlossary: ['SELECT', 'INSERT', 'UPDATE'],
  translationGlossaryTerms: ['SELECT', 'INSERT', 'UPDATE'],
  translationReviewEntries: ['SELECT', 'INSERT', 'UPDATE'],
  translationReviewHistory: ['SELECT', 'INSERT'],
  translationSegments: ['SELECT', 'INSERT', 'UPDATE'],
  translationSegmentHistory: ['SELECT', 'INSERT'],
  translationJobs: ['SELECT', 'INSERT', 'UPDATE'],
  translationRejections: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  translationWorkerLeases: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  translationCacheJobs: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  localizedPublicationIndexes: ['SELECT', 'UPDATE', 'DELETE'],
  localizedPublicationIndexState: ['SELECT', 'UPDATE'],
  publicCachePublications: ['SELECT', 'INSERT', 'UPDATE'],
  glossaryFeedback: ['SELECT', 'INSERT', 'UPDATE'],
  glossaryReactionEvents: ['SELECT', 'INSERT'],
  documentIds: ['SELECT', 'INSERT'],
};
const reader: Record<string, string[]> = {
  translationGlossary: ['SELECT'],
  translationGlossaryTerms: ['SELECT'],
  translationReviewEntries: ['SELECT'],
  glossaryFeedback: ['SELECT', 'INSERT'],
  glossaryReactionEvents: ['SELECT', 'INSERT'],
  documentIds: ['SELECT', 'INSERT'],
};
const columns: Record<string, string[]> = {
  translationGlossary: ['retranslation_requested_at'],
  translationReviewEntries: ['locale','scope','source_id','revision','draft','approved','updated_at'],
  translationReviewHistory: ['locale','scope','source_id','revision','action','before_state','after_state','actor','reason','created_at'],
  translationSegmentHistory: ['id','locale','hash','before_state','after_state','created_at'],
  glossaryFeedback: ['_id','_creationTime','locale','term','target','version','id','visitor','details','alternative','status','created_at','review_notes','reviewed_by','reviewed_at'],
  glossaryReactionEvents: ['_id','_creationTime','locale','term','target','version','id','visitor','choice','created_at'],
};
const safe = (value: unknown) => console.log(JSON.stringify(value));
const failures: string[] = [];
let client: pg.Client | undefined;
let began = false;
try {
  const surface = process.env.DOSEWIKI_BUILD_SURFACE;
  if (surface !== 'public' && surface !== 'editor') throw new Error('PREFLIGHT_SURFACE_REQUIRED');
  const present = (key: string) => Boolean(process.env[key]?.trim());
  if (process.env.DATA_BACKEND !== 'postgres') failures.push('DATA_BACKEND must be postgres');
  if (!present('POSTGRES_POOLED_URL')) throw new Error('PREFLIGHT_RUNTIME_TARGET_REQUIRED');
  if (surface === 'public') {
    for (const key of Object.keys(process.env)) {
      if (!present(key)) continue;
      const privileged = key === 'DATA_ADMIN_KEY' || key === 'CONVEX_ADMIN_KEY' ||
        ((key.startsWith('DATA_ADMIN_TOKEN_') || key.startsWith('CONVEX_ADMIN_TOKEN_')) &&
          key !== 'DATA_ADMIN_TOKEN_PUBLIC_INTAKE_CREATE' && key !== 'CONVEX_ADMIN_TOKEN_PUBLIC_INTAKE_CREATE');
      if (privileged) failures.push(`Public environment carries forbidden credential variable ${key}`);
    }
  }
  if (!present('DATA_ADMIN_TOKEN_PUBLIC_INTAKE_CREATE')) failures.push('Missing public intake token');
  if (!present('SITE_FEEDBACK_IP_HASH_SECRET')) failures.push('Missing release-required SITE_FEEDBACK_IP_HASH_SECRET');
  client = new pg.Client({ connectionString: process.env.POSTGRES_POOLED_URL, connectionTimeoutMillis: 15_000 });
  await client.connect();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  began = true;
  await client.query("SET LOCAL statement_timeout = '20s'");
  const identity = (await client.query('SELECT current_user,session_user,current_database() AS database')).rows[0];
  safe({ check: 'language-runtime-identity', surface, ...identity });
  const roles = (await client.query("SELECT pg_has_role(current_user,'pg_read_all_data','MEMBER') AS read_all,pg_has_role(current_user,'pg_write_all_data','MEMBER') AS write_all")).rows[0];
  if (roles.write_all) failures.push('Unexpected pg_write_all_data membership');
  const schema = (await client.query("SELECT has_schema_privilege(current_user,'public','USAGE') AS usage,has_schema_privilege(current_user,'public','CREATE') AS create")).rows[0];
  if (!schema.usage || schema.create) failures.push('Runtime schema privilege mismatch');
  const structure: {table:string;ok:boolean}[] = [];
  for (const [table, expected] of Object.entries(columns)) {
    const actual = (await client.query('SELECT a.attname FROM pg_attribute a WHERE a.attrelid=to_regclass($1) AND a.attnum>0 AND NOT a.attisdropped',[`public."${table}"`])).rows.map(row => row.attname);
    const ok = expected.every(column => actual.includes(column));
    if (!ok) failures.push(`Migration0020/0021 structure missing for ${table}`);
    structure.push({table,ok});
  }
  safe({check:'language-migration-structure',version:'0020+0021',checks:structure,note:'Structure check only; release operator separately verified all22migration hashes'});
  const matrix = surface === 'editor' ? editor : reader;
  const checks: {table:string;privileges:Record<string,boolean>}[] = [];
  for (const [table, required] of Object.entries(matrix)) {
    const privileges: Record<string,boolean> = {};
    const exists = (await client.query('SELECT to_regclass($1) IS NOT NULL AS present',[`public."${table}"`])).rows[0].present;
    if (!exists) { failures.push(`Missing relation ${table}`); continue; }
    for (const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) {
      const allowed = (await client.query('SELECT has_table_privilege(current_user,$1,$2) AS allowed',[`public."${table}"`,privilege])).rows[0].allowed;
      privileges[privilege] = allowed;
      if (required.includes(privilege) && !allowed) failures.push(`Missing ${table} ${privilege}`);
      // Editor's exact reviewed matrix also proves immutable history protections.
      if (surface === 'editor' && !required.includes(privilege) && allowed) failures.push(`Unexpected ${table} ${privilege}`);
    }
    checks.push({table,privileges});
  }
  safe({check:'language-runtime-table-privileges',checks});
  if (surface === 'editor') {
    const sequence=(await client.query(`SELECT pg_get_serial_sequence('public."translationSegmentHistory"','id') AS name`)).rows[0].name;
    if (!sequence) failures.push('Missing history sequence');
    else {
      const privileges: Record<string,boolean>={};
      for (const privilege of ['USAGE','SELECT','UPDATE']) {
        const allowed=(await client.query('SELECT has_sequence_privilege(current_user,$1,$2) AS allowed',[sequence,privilege])).rows[0].allowed;
        privileges[privilege]=allowed;
        if(allowed !== (privilege==='USAGE' || (privilege==='SELECT' && roles.read_all))) failures.push(`History sequence ${privilege} mismatch`);
      }
      safe({check:'language-runtime-history-sequence',privileges});
    }
  }
  await client.query('ROLLBACK'); began=false;
  safe({check:'language-runtime-preflight',ok:failures.length===0,surface,failures});
  if(failures.length) process.exitCode=1;
} catch (error) {
  // Connection and provider error messages can contain credentials or hosts.
  const code=(error as {code?:unknown}).code;
  const label=error instanceof Error && /^PREFLIGHT_[A-Z_]+$/.test(error.message) ? error.message : 'PREFLIGHT_QUERY_FAILED';
  safe({check:'language-runtime-preflight',ok:false,label,code:typeof code==='string' && /^[A-Z0-9_]{1,40}$/.test(code) ? code : undefined});
  process.exitCode=1;
} finally {
  if(began) await client?.query('ROLLBACK').catch(()=>{});
  await client?.end().catch(()=>{});
}
