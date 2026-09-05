import path from 'node:path';
import { parseDocx } from './parsers/docx.js';
import { parseJson } from './parsers/json.js';
import { parsePdf } from './parsers/pdf.js';
import { extractRules } from '../extract/rules.js';
import { transaction } from '../db.js';
import { ensure } from '../errors.js';

export async function ingest(pool, { buffer, name, type, userId, extractor }) {
  name = path.basename(name ?? '');
  const extension = path.extname(name).toLowerCase();
  ensure(['.json','.docx','.pdf'].includes(extension), 415, 'Only DOCX, PDF and JSON files are supported');
  ensure(['handbook','template','faq','config','training','playbook'].includes(type), 400, 'Unsupported artefact type');
  ensure(buffer?.length > 0 && buffer.length <= 5 * 1024 * 1024, 413, 'Upload must contain 1 byte to 5 MB');
  const format = extension === '.json' ? 'JSON' : extension === '.pdf' ? 'PDF' : 'DOCX';
  const parsed = format === 'JSON' ? parseJson(buffer) : format === 'PDF' ? await parsePdf(buffer) : await parseDocx(buffer);
  // Provider calls happen before opening a transaction. Extraction has no database handle.
  const results = [];
  for (const segment of parsed.segments) results.push(await extractRules(segment, { name, format, extractor }));
  return transaction(pool, async db => {
    const artefact = (await db.query('INSERT INTO artefacts(name,type,format) VALUES($1,$2,$3) RETURNING *', [name,type,format])).rows[0];
    const version = (await db.query("INSERT INTO artefact_versions(artefact_id,version,raw_text,status,created_by) VALUES($1,1,$2,'CURRENT',$3) RETURNING *", [artefact.id,parsed.raw_text,userId])).rows[0];
    await db.query('UPDATE artefacts SET current_version_id=$2,analysis_version_id=$2 WHERE id=$1', [artefact.id,version.id]);
    for (let i = 0; i < parsed.segments.length; i++) {
      const s = parsed.segments[i], result = results[i];
      const segment = (await db.query(`INSERT INTO artefact_segments(version_id,ordinal,locator,char_start,char_end,text,value_start,value_end,extraction_confidence,extraction_error)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [version.id,s.ordinal,s.locator,s.char_start,s.char_end,s.text,s.value_start,s.value_end,result.confidence,result.error])).rows[0];
      for (const rule of result.rules) {
        const keys = Object.keys(rule);
        await db.query(`INSERT INTO internal_rules(segment_id,${keys.join(',')}) VALUES($1,${keys.map((_, j) => `$${j + 2}`).join(',')})`, [segment.id,...Object.values(rule)]);
      }
    }
    return { id: artefact.id, name, format, version_id: version.id, version: 1,
      segment_count: parsed.segments.length, rule_count: results.reduce((n, r) => n + r.rules.length, 0),
      extraction_warnings: results.filter(r => r.error).length, warnings: parsed.warnings };
  });
}
