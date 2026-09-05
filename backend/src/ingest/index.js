import path from 'node:path';
import { parseDocx } from './parsers/docx.js';
import { parseJson } from './parsers/json.js';
import { parsePdf } from './parsers/pdf.js';
import { extractRules } from '../extract/rules.js';
import { discoverConcepts } from '../extract/discover.js';
import { loadConcepts } from '../vocabulary.js';
import { transaction } from '../db.js';
import { ensure } from '../errors.js';

export async function ingest(pool, { buffer, name, type, userId, extractor, discoverer = null }) {
  name = path.basename(name ?? '');
  const extension = path.extname(name).toLowerCase();
  ensure(['.json','.docx','.pdf'].includes(extension), 415, 'Only DOCX, PDF and JSON files are supported');
  ensure(['handbook','template','faq','config','training','playbook'].includes(type), 400, 'Unsupported artefact type');
  ensure(buffer?.length > 0 && buffer.length <= 5 * 1024 * 1024, 413, 'Upload must contain 1 byte to 5 MB');
  const format = extension === '.json' ? 'JSON' : extension === '.pdf' ? 'PDF' : 'DOCX';
  const parsed = format === 'JSON' ? parseJson(buffer) : format === 'PDF' ? await parsePdf(buffer) : await parseDocx(buffer);
  // Discovery runs first so a document from an unseen practice area can define
  // the concepts it needs before its own segments are extracted.
  const discovered = format === 'JSON' ? [] : await discoverConcepts(pool, { text: parsed.raw_text, discoverer });
  const concepts = await loadConcepts(pool, { force: discovered.length > 0 });
  // Provider calls happen before opening a transaction. Extraction has no database handle.
  //
  // A segment stating no quantity cannot produce a numeric rule, so it is
  // skipped; the rest run in small concurrent batches rather than strictly one
  // after another. A quantity is not always a digit - "once every year" states
  // one - so number words count too. Without this a long manual costs one slow
  // API call per paragraph.
  const NUMBER_WORD = /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|annual|annually|monthly|weekly|daily|quarterly|biennial|each|every|per)\b/i;
  const extractable = segment =>
    format === 'JSON' || /\d/.test(segment.text) || NUMBER_WORD.test(segment.text);
  const empty = { rules: [], confidence: 'LOW', error: 'No numeric content to extract' };
  const results = new Array(parsed.segments.length);
  const pending = parsed.segments
    .map((segment, index) => ({ segment, index }))
    .filter(({ segment, index }) => (extractable(segment) ? true : ((results[index] = empty), false)));

  const CONCURRENCY = 8;
  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const batch = pending.slice(i, i + CONCURRENCY);
    const extracted = await Promise.all(
      batch.map(({ segment }) => extractRules(segment, { name, format, extractor, concepts })),
    );
    batch.forEach(({ index }, n) => { results[index] = extracted[n]; });
  }
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
