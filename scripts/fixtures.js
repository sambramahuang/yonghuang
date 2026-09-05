import { mkdir, writeFile } from 'node:fs/promises';
import { Document, Packer, Paragraph, TextRun } from 'docx';

// These are parser/test fixtures, not legal documents for operational use.
const artefacts = [
  ['employee-handbook.docx', 'Employee handbook', [
    'This handbook summarises the retirement arrangements used by the firm.',
    'The statutory retirement age is 63.',
    'Before 1 July 2026, the statutory retirement age was 63.',
  ]],
  ['offer-letter-template.docx', 'Offer letter template', [
    'We are pleased to offer you employment on the following terms.',
    'Employment continues until the statutory retirement age of 63.',
    'Refer to clause 63 of the Staff Manual.',
  ]],
  ['hr-faq.docx', 'Human resources questions', [
    'These answers describe the arrangements offered to employees approaching retirement.',
    'Our policy is to offer re-employment until age 70.',
    'Re-employment is offered at 63, unless the employee is medically unfit.',
  ]],
  ['employment-negotiation-playbook.docx', 'Employment contract negotiation playbook', [
    'This playbook tells associates what to concede and what to refuse when negotiating employment terms.',
    'Do not agree to a retirement age below the statutory retirement age of 63.',
    'If the counterparty demands an unlimited indemnity, refuse it and cap liability at SGD 50,000.',
  ]],
];
await mkdir(new URL('../fixtures/',import.meta.url),{ recursive: true });
const recordings = {};
for (const [name,title,paragraphs] of artefacts) {
  const doc = new Document({ creator: 'Yonghuang test fixtures',
    sections: [{ children: [new Paragraph({ text: title,heading: 'Title' }),
      ...paragraphs.map(text => new Paragraph({ children: [new TextRun(text)] }))] }] });
  await writeFile(new URL(`../fixtures/${name}`,import.meta.url),await Packer.toBuffer(doc));
  for (const text of [title,...paragraphs]) recordings[text] = [];
}
function rule(text,concept,value,extra = {}) {
  recordings[text] = [{ concept,modality: 'IS',operator: '=',value,unit: 'years',assertion_type: 'STATES_LAW',
    temporal_frame: 'PRESENT',applies_to_condition: null,evidence_quote: text,extraction_confidence: 'HIGH',...extra }];
}
rule('The statutory retirement age is 63.','retirement_age',63);
rule('Before 1 July 2026, the statutory retirement age was 63.','retirement_age',63,{ temporal_frame: 'HISTORICAL' });
rule('Employment continues until the statutory retirement age of 63.','retirement_age',63);
rule('Our policy is to offer re-employment until age 70.','reemployment_age',70,{ assertion_type: 'STATES_POLICY' });
rule('Re-employment is offered at 63, unless the employee is medically unfit.','reemployment_age',63,
  { applies_to_condition: 'unless the employee is medically unfit' });
rule('Do not agree to a retirement age below the statutory retirement age of 63.','retirement_age',63);
await mkdir(new URL('../backend/prompts/__fixtures__/',import.meta.url),{ recursive: true });
await writeFile(new URL('../backend/prompts/__fixtures__/responses.json',import.meta.url),JSON.stringify(recordings,null,2) + '\n');
await writeFile(new URL('../fixtures/hr-system-config.json',import.meta.url),JSON.stringify({ hr: { retirementAge: 63,reemploymentAge: 68 } },null,2) + '\n');
console.log('Created five demo artefacts and recorded extraction responses.');
