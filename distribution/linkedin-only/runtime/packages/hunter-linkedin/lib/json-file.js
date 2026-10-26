import fs from 'node:fs';

export function parseJsonText(text) {
  return JSON.parse(String(text).replace(/^\uFEFF/, ''));
}

export function readJsonFile(filePath) {
  return parseJsonText(fs.readFileSync(filePath, 'utf8'));
}
