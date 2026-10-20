import {messages, chineseDecorations} from './messages.js';
import {defaults} from './data.js';

const KEY = 'catapp-language';
let current = 'zh';
try { if (globalThis.localStorage?.getItem(KEY) === 'en') current = 'en'; } catch { /* Storage is optional. */ }
export const language = () => current;
export function setLanguage(value) {
  if (!['zh', 'en'].includes(value)) return;
  current = value;
  try { globalThis.localStorage?.setItem(KEY, value); } catch { /* Keep the selection for this visit. */ }
}
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patterns = new Map();
function dictionary(locale) { return locale === 'en' ? messages : chineseDecorations; }
export function translate(value, locale = current) {
  const text = String(value ?? ''), entries = dictionary(locale);
  if (!patterns.has(locale)) patterns.set(locale, new RegExp(Object.keys(entries).sort((a,b) => b.length-a.length).map(escapeRegex).join('|'), 'g'));
  const result = text.replace(patterns.get(locale), key => entries[key]);
  return locale === 'en' ? result.replaceAll('。', '.').replaceAll('、', ', ') : result;
}
export const t = value => translate(value);
// Translate only template source, never interpolated values (user input, paths or HTML).
export const htmlFor = locale => (parts, ...values) => parts.reduce((out, part, i) => out + translate(part, locale) + (i < values.length ? values[i] : ''), '');
export const html = (parts, ...values) => htmlFor(current)(parts, ...values);

// Only recognized seed values get a display translation. Custom content is returned verbatim.
const seedValues = new Set();
function collectSeedValues(value) {
  if (typeof value === 'string') seedValues.add(value);
  else if (value && typeof value === 'object') Object.values(value).forEach(collectSeedValues);
}
collectSeedValues(defaults());
export function demoText(value) { return current === 'en' && seedValues.has(value) ? messages[value] ?? value : value; }
export function originalField(object, key, submitted) {
  return submitted === String(demoText(object[key])) ? object[key] : submitted;
}
export function workTitle(work, locale = current) {
  if (locale !== 'en') return work.title;
  const match = /^每日漫画 · ([\d.]+)(?: \/ 第 (\d+) 篇)?$/.exec(work.title);
  return match ? `Daily photo story · ${match[1]}${match[2] ? ` / No. ${match[2]}` : ''}` : work.title;
}
export const localizedComicURL = work => `${work.comicUrl}?lang=${current}`;
export function captureError(message) {
  const split = message.indexOf('：');
  const prefix = split >= 0 ? message.slice(0, split) : '';
  const detail = split >= 0 ? message.slice(split + 1) : message;
  const translated = current === 'en' ? messages[detail] ?? 'Photo sync failed. Please try again.' : (/[\u4e00-\u9fff]/.test(detail) ? detail : '照片同步失败，请稍后重试。');
  return prefix ? `${prefix}: ${translated}` : translated;
}
