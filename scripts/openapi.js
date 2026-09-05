import { writeFile } from 'node:fs/promises';

const ref = name => ({ $ref: `#/components/schemas/${name}` });
const str = { type: 'string' }, integer = { type: 'integer' }, id = { type: 'string',pattern: '^[0-9]+$' };
const nullable = schema => ({ anyOf: [schema,{ type: 'null' }] });
const array = items => ({ type: 'array',items });
const object = (properties,required = []) => ({ type: 'object',properties,...(required.length ? { required } : {}) });
const enumeration = values => ({ type: 'string',enum: values });
const numeric = { oneOf: [{ type: 'number' },{ type: 'string',pattern: '^-?[0-9]+(\\.[0-9]+)?$' }] };
const status = enumeration(['CURRENT','UPDATE_NEEDED','POSSIBLE_IMPACT','LEGAL_REVIEW_REQUIRED']);
const reason = enumeration(['NOT_APPLICABLE','WRONG_MATCH','POLICY_EXCEEDS','NEEDS_COUNSEL','OTHER']);
const change = object({ id,update_id: id,concept: str,change_type: str,old_value: nullable(numeric),new_value: nullable(numeric),unit: str,source_span: str });
const version = object({ id,artefact_id: id,version: integer,raw_text: str,supersedes: nullable(id),
  status: enumeration(['CURRENT','SUPERSEDED']),created_by: id,approved_by: nullable(id),created_at: { type: 'string',format: 'date-time' } });
const patch = object({ old: str,new: str,start: integer,end: integer,base_version_id: id },['old','new','start','end','base_version_id']);
const impactProperties = {
  id,change_id: id,segment_id: id,rule_id: nullable(id),evidence_tier: enumeration(['STRUCTURED','LEXICAL']),system_status: status,
  explanation: str,proposed_patch: nullable({ allOf: [ref('Patch')] }),workflow_state: enumeration(['DRAFT','SUBMITTED','RESOLVED']),
  revision: integer,resolution: nullable(enumeration(['ACCEPTED','REJECTED','ESCALATED'])),rejection_reason: nullable(reason),
  edited_by: nullable(id),submitted_by: nullable(id),approved_by: nullable(id),resolved_by: nullable(id),resolving_version_id: nullable(id),resolved_at: nullable(str),
};
const segment = object({ id,version_id: id,ordinal: integer,locator: str,char_start: integer,char_end: integer,text: str,
  value_start: nullable(integer),value_end: nullable(integer),extraction_confidence: enumeration(['HIGH','LOW']),extraction_error: nullable(str) });
const rule = object({ id,segment_id: id,concept: nullable(str),modality: enumeration(['IS','MUST','MUST_NOT','MAY']),
  operator: nullable(enumeration(['=','>=','<=','>','<'])),value: nullable(numeric),unit: nullable(str),
  assertion_type: enumeration(['STATES_LAW','STATES_POLICY','STATES_BOTH']),temporal_frame: enumeration(['PRESENT','HISTORICAL','FUTURE']),
  applies_to_condition: nullable(str),has_qualifier: { type: 'boolean' },evidence_start: integer,evidence_end: integer,
  extraction_confidence: enumeration(['HIGH','LOW']) });
const artefactProperties = { id,name: str,type: str,format: enumeration(['DOCX','JSON']),current_version_id: id,analysis_version_id: id };
const updateProperties = { id,provider_ref: str,title: str,source_url: nullable(str),gazetted_date: nullable(str),effective_date: str };
const schemas = {
  Error: object({ error: str },['error']), User: object({ id,name: str,capability: enumeration(['REVIEWER','APPROVER']) }),
  Health: object({ status: enumeration(['ok']),extraction_mode: enumeration(['fixture','live']) }),
  Patch: patch,Version: version,Segment: segment,Rule: rule,Impact: object(impactProperties),
  ImpactListItem: object({ ...impactProperties,artefact_id: id,name: str,locator: str,segment_text: str,concept: str,update_id: id }),
  ImpactDetail: object({ ...impactProperties,artefact_id: id,name: str,format: str,current_version_id: id,
    change: ref('Change'),regulatory_update: ref('Update'),segment: ref('Segment'),rule: nullable({ allOf: [ref('Rule')] }),
    evidence_raw_text: str,evidence: object({ start: integer,end: integer,quote: str,locator: str,version_id: id }),
    audit: array(object({ id,impact_id: id,actor_id: id,actor_name: str,action: str,details: { type: 'object' },created_at: str })) }),
  Artefact: object({ ...artefactProperties,version: integer }),
  ArtefactDetail: object({ ...artefactProperties,current_version: ref('Version'),versions: array(ref('Version')),
    segments: array(ref('Segment')),rules: array(ref('Rule')),analysis_is_stale: { type: 'boolean' } }),
  ImportResult: object({ id,name: str,format: str,version_id: id,version: integer,segment_count: integer,rule_count: integer,extraction_warnings: integer,warnings: array(str) }),
  Change: change,Update: object(updateProperties),UpdateDetail: object({ ...updateProperties,changes: array(ref('Change')) }),
  IntakeResult: object({ id,created: { type: 'boolean' } }),
  Analysis: object({ update_id: id,created: integer,
    not_actioned: array(object({ segment_id: id,artefact_id: id,name: str,locator: str,text: str,reason: enumeration(['HISTORICAL']) })),
    gaps: array(object({ change_id: id,concept: str,system_status: enumeration(['POSSIBLE_IMPACT']),explanation: str })) }),
  Revision: object({ revision: { type: 'integer',minimum: 1 } },['revision']),
  EditPatch: object({ revision: integer,new: { type: 'string',pattern: '^(0|[1-9][0-9]*)(\\.[0-9]+)?$',maxLength: 30 } },['revision','new']),
  Reject: object({ revision: integer,rejection_reason: reason,note: { type: 'string',maxLength: 5000 } },['revision','rejection_reason']),
  Escalate: object({ revision: integer,note: { type: 'string',maxLength: 5000 } },['revision']),
  Approval: object({ impact: ref('Impact'),version: ref('Version') }),
  RegulatoryPayload: object({ provider_ref: { type: 'string',minLength: 1,maxLength: 200 },title: { type: 'string',minLength: 1,maxLength: 1000 },
    source_url: nullable({ type: 'string',format: 'uri' }),gazetted_date: nullable({ type: 'string',format: 'date' }),effective_date: { type: 'string',format: 'date' },
    changes: { type: 'array',minItems: 1,maxItems: 20,items: object({
      concept: enumeration(['retirement_age','reemployment_age','cpf_ow_ceiling','shared_parental_leave_weeks','paternity_leave_weeks']),
      change_type: enumeration(['VALUE_CHANGED','DUTY_ADDED','DUTY_REMOVED','SCOPE_CHANGED']),old_value: nullable({ type: 'number',minimum: 0 }),
      new_value: nullable({ type: 'number',minimum: 0 }),unit: str,source_span: { type: 'string',minLength: 1,maxLength: 10000 },
    },['concept','change_type','unit','source_span']) } },['provider_ref','title','effective_date','changes']),
};
const response = (schema,description = 'Success') => ({ description,content: { 'application/json': { schema } } });
const paths = {};
function route(path,method,summary,result,{ body,code = '200',publicRoute = false } = {}) {
  const operation = { summary,operationId: `${method}_${path.replace(/[^a-zA-Z0-9]+/g,'_')}`,responses: {
    [code]: response(result),default: response(ref('Error'),'Request failed; see error message and HTTP status'),
  } };
  if (publicRoute) operation.security = [];
  if (path.includes('{id}')) operation.parameters = [{ in: 'path',name: 'id',required: true,schema: id }];
  if (body) operation.requestBody = { required: true,content: { 'application/json': { schema: ref(body) } } };
  paths[path] ??= {}; paths[path][method] = operation;
  return operation;
}
route('/health','get','Check backend health and extraction mode',ref('Health'),{ publicRoute: true });
route('/me','get','Get active account',ref('User'));
route('/users','get','List seeded accounts',array(ref('User')));
route('/artefacts','get','List imported artefacts',array(ref('Artefact')));
const upload = route('/artefacts','post','Upload and extract a DOCX or JSON artefact',ref('ImportResult'),{ code: '201' });
upload.requestBody = { required: true,content: { 'multipart/form-data': { schema: object({ file: { type: 'string',format: 'binary' },
  type: enumeration(['handbook','template','faq','config','training']) },['file','type']) } } };
route('/artefacts/{id}','get','Get current content and versioned original evidence',ref('ArtefactDetail'));
const download = route('/artefacts/{id}/download','get','Download current JSON or normalized text',str);
download.responses['200'] = { description: 'File attachment; DOCX imports download as .txt',content: { 'application/json': { schema: { type: 'object' } },'text/plain': { schema: str } } };
route('/regulatory-updates','get','List updates',array(ref('Update')));
const intake = route('/regulatory-updates','post','Receive a structured update idempotently',ref('IntakeResult'),{ body: 'RegulatoryPayload',code: '201' });
intake.responses['200'] = response(ref('IntakeResult'),'Identical provider_ref replay');
route('/regulatory-updates/{id}','get','Get update and changes',ref('UpdateDetail'));
route('/regulatory-updates/{id}/analyse','post','Analyse effective update and return new-finding count, historical suppressions and gaps',ref('Analysis'));
const list = route('/impacts','get','List findings',array(ref('ImpactListItem')));
list.parameters = [{ in: 'query',name: 'update_id',schema: id },{ in: 'query',name: 'status',schema: status },{ in: 'query',name: 'open',schema: { type: 'boolean' } }];
route('/impacts/{id}','get','Get both evidence sources and audit',ref('ImpactDetail'));
route('/impacts/{id}/patch','patch','Edit numeric replacement; invalidates prior submission',ref('Impact'),{ body: 'EditPatch' });
route('/impacts/{id}/submit','post','Submit patch for separate approval',ref('Impact'),{ body: 'Revision' });
route('/impacts/{id}/approve','post','APPROVER: approve another user\'s submission',ref('Approval'),{ body: 'Revision' });
route('/impacts/{id}/accept','post','APPROVER: accept a finding that proposes no edit; no version is written',ref('Impact'),{ body: 'Revision' });
route('/impacts/{id}/reject','post','APPROVER: reject a finding without changing content',ref('Impact'),{ body: 'Reject' });
route('/impacts/{id}/escalate','post','Escalate a finding for counsel',ref('Impact'),{ body: 'Escalate' });

const spec = { openapi: '3.1.0',info: { title: 'Yonghuang regulatory impact API',version: '0.1.0',description: 'Local demo backend. UTF-16 evidence offsets; signed bearer tokens; separate reviewer/approver workflow.' },
  servers: [{ url: 'http://127.0.0.1:3001/api' }],security: [{ bearerAuth: [] }],paths,
  components: { securitySchemes: { bearerAuth: { type: 'http',scheme: 'bearer',description: 'Eight-hour token issued by npm run token -- reviewer|approver' } },schemas } };
await writeFile(new URL('../docs/openapi.json',import.meta.url),JSON.stringify(spec,null,2) + '\n');
console.log(`Wrote OpenAPI contract for ${Object.values(paths).reduce((n,p) => n + Object.keys(p).length,0)} operations.`);
