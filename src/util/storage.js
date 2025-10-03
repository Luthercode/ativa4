import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

function ensureFile(path, defaultData) {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(path)) {
    writeFileSync(path, JSON.stringify(defaultData, null, 2), 'utf8');
  }
}

export function loadJson(path, defaultData) {
  ensureFile(path, defaultData);
  try {
    const raw = readFileSync(path, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('Erro lendo JSON', path, e);
    return structuredClone(defaultData);
  }
}

export function saveJson(path, data) {
  try {
    writeFileSync(path, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('Erro salvando JSON', path, e);
  }
}
