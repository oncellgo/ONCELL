#!/usr/bin/env node
/**
 * aruljohn/Bible-kjv (public domain KJV JSON)를 다운로드해
 * data/bible-kjv.json (포맷 A) 단일 파일로 병합 저장한다.
 *
 * 사용:
 *   node scripts/download-kjv.mjs
 *
 * 요구: Node.js 18+ (global fetch).
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const BASE = 'https://raw.githubusercontent.com/aruljohn/Bible-kjv/master';

// 저장소의 실제 파일명(공백·숫자 접두어). 영문 canonical과 일치.
const BOOKS = [
  'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy',
  'Joshua', 'Judges', 'Ruth',
  '1Samuel', '2Samuel', '1Kings', '2Kings', '1Chronicles', '2Chronicles',
  'Ezra', 'Nehemiah', 'Esther',
  'Job', 'Psalms', 'Proverbs', 'Ecclesiastes', 'SongofSolomon',
  'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel',
  'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi',
  'Matthew', 'Mark', 'Luke', 'John', 'Acts',
  'Romans', '1Corinthians', '2Corinthians', 'Galatians', 'Ephesians', 'Philippians', 'Colossians',
  '1Thessalonians', '2Thessalonians', '1Timothy', '2Timothy', 'Titus', 'Philemon',
  'Hebrews', 'James', '1Peter', '2Peter', '1John', '2John', '3John', 'Jude', 'Revelation',
];

// canonical key ( BiblePassageCard/lookupPassage 와 동일 포맷: 공백 포함 "1 Samuel" )
const CANONICAL = {
  '1Samuel': '1 Samuel', '2Samuel': '2 Samuel',
  '1Kings': '1 Kings', '2Kings': '2 Kings',
  '1Chronicles': '1 Chronicles', '2Chronicles': '2 Chronicles',
  'SongofSolomon': 'Song of Solomon',
  '1Corinthians': '1 Corinthians', '2Corinthians': '2 Corinthians',
  '1Thessalonians': '1 Thessalonians', '2Thessalonians': '2 Thessalonians',
  '1Timothy': '1 Timothy', '2Timothy': '2 Timothy',
  '1Peter': '1 Peter', '2Peter': '2 Peter',
  '1John': '1 John', '2John': '2 John', '3John': '3 John',
};

const canonicalOf = (f) => CANONICAL[f] || f;

const out = { books: {} };

let total = 0;
for (const file of BOOKS) {
  const url = `${BASE}/${file}.json`;
  process.stdout.write(`  ${file.padEnd(18)} `);
  const res = await fetch(url, { headers: { 'User-Agent': 'kcis-downloader' } });
  if (!res.ok) { console.log(`✗ HTTP ${res.status}`); continue; }
  const j = await res.json();
  const bookKey = canonicalOf(file);
  const chapters = {};
  for (const chObj of j.chapters || []) {
    const chNum = String(chObj.chapter);
    const verses = {};
    for (const v of chObj.verses || []) verses[String(v.verse)] = v.text;
    chapters[chNum] = verses;
  }
  out.books[bookKey] = chapters;
  const verseCount = Object.values(chapters).reduce((a, c) => a + Object.keys(c).length, 0);
  total += verseCount;
  console.log(`${Object.keys(chapters).length}장 / ${verseCount}절`);
}

const dataDir = path.join(process.cwd(), 'data');
if (!existsSync(dataDir)) await mkdir(dataDir, { recursive: true });
const dest = path.join(dataDir, 'bible-kjv.json');
await writeFile(dest, JSON.stringify(out), 'utf8');
console.log(`\n✓ ${dest} 저장 완료 — 총 ${total.toLocaleString()}절`);
