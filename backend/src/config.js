import { readFileSync } from 'node:fs';
export const vocabulary = JSON.parse(readFileSync(new URL('../config/concepts.json', import.meta.url), 'utf8'));
export const concepts = new Map(vocabulary.concepts.map(c => [c.id, c]));
export const configFields = JSON.parse(readFileSync(new URL('../config/config-fields.json', import.meta.url), 'utf8'));
export const escapeRegex = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const qualifierPattern = new RegExp(`\\b(?:${vocabulary.qualifier_patterns.map(escapeRegex).join('|')})\\b`, 'i');
