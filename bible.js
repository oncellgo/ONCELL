/**
 * 개역한글 성경 조회 모듈 (CommonJS)
 *
 * 사용법:
 *   const bible = require("./bible");
 *   bible.load("./bible.json");                  // 앱 시작 시 1회
 *   bible.getVerse("창세기 1:1");                 // -> "태초에 하나님이 ..."
 *   bible.getRange("창세기 1:1-3");               // -> [{ref, book, chapter, verse, text}, ...]
 *   bible.getRange("요한복음 3:16-17");
 *   bible.getRange("창세기 1:30-2:3");            // 장 경계를 넘어가는 범위도 지원
 *   bible.getChapter("시편", 23);                 // 한 장 전체
 *   bible.listBooks();                            // 책 목록
 *
 * 참조 문자열 형식
 *   "<책이름> <장>:<절>"              - 단일 절
 *   "<책이름> <장>:<시작절>-<끝절>"   - 같은 장 범위
 *   "<책이름> <장>:<절>-<장>:<절>"    - 장 경계 범위
 *
 * 책 이름에 공백이 포함되는 "예레미야 애가" 같은 경우도 올바르게 파싱합니다.
 */

const fs = require("fs");

let _bible = null; // { books: [...], data: { book: { chapter: { verse: text } } } }

/** bible.json을 로드합니다. */
function load(jsonPath) {
  const raw = fs.readFileSync(jsonPath, "utf8");
  _bible = JSON.parse(raw);
  return _bible;
}

/** 이미 파싱된 객체를 주입 (브라우저/테스트용). */
function setData(obj) {
  _bible = obj;
}

function _ensureLoaded() {
  if (!_bible) {
    throw new Error("성경 데이터가 로드되지 않았습니다. 먼저 bible.load(path) 를 호출하세요.");
  }
}

/**
 * 참조 문자열을 파싱합니다.
 * 반환: { book, startChapter, startVerse, endChapter, endVerse }
 */
function parseReference(ref) {
  if (typeof ref !== "string") throw new TypeError("참조는 문자열이어야 합니다.");
  const s = ref.trim().replace(/\s+/g, " ");

  // 오른쪽 끝의 "장:절[-장:절|-절]" 패턴을 떼어내고 앞부분은 책이름으로 본다.
  // 예:
  //   "창세기 1:1"          -> 1:1
  //   "창세기 1:1-5"        -> 1:1 ~ 1:5
  //   "창세기 1:30-2:3"     -> 1:30 ~ 2:3
  const m = s.match(/^(.+?)\s+(\d+):(\d+)(?:-(?:(\d+):)?(\d+))?$/);
  if (!m) throw new Error(`참조 형식을 이해할 수 없습니다: "${ref}"`);

  const book = m[1].trim();
  const startChapter = parseInt(m[2], 10);
  const startVerse = parseInt(m[3], 10);
  const endChapter = m[4] != null ? parseInt(m[4], 10) : startChapter;
  const endVerse = m[5] != null ? parseInt(m[5], 10) : startVerse;

  return { book, startChapter, startVerse, endChapter, endVerse };
}

/** 단일 절 조회 - 본문 문자열 반환. 없으면 null. */
function getVerse(ref) {
  _ensureLoaded();
  const { book, startChapter, startVerse } = parseReference(ref);
  return _getVerseText(book, startChapter, startVerse);
}

function _getVerseText(book, chapter, verse) {
  const b = _bible.data[book];
  if (!b) return null;
  const c = b[String(chapter)];
  if (!c) return null;
  const v = c[String(verse)];
  return v == null ? null : v;
}

/**
 * 범위 조회 - [{ ref, book, chapter, verse, text }, ...] 반환.
 * 범위 안에 실제로 존재하는 절만 돌려줍니다(빈 절은 건너뜀).
 */
function getRange(ref) {
  _ensureLoaded();
  const parsed = parseReference(ref);
  const { book, startChapter, startVerse, endChapter, endVerse } = parsed;

  const bookData = _bible.data[book];
  if (!bookData) return [];

  const results = [];
  for (let ch = startChapter; ch <= endChapter; ch++) {
    const chapter = bookData[String(ch)];
    if (!chapter) continue;

    // 각 장의 절 범위 결정
    const verseNums = Object.keys(chapter)
      .map((n) => parseInt(n, 10))
      .sort((a, b) => a - b);

    const lo = ch === startChapter ? startVerse : verseNums[0];
    const hi = ch === endChapter ? endVerse : verseNums[verseNums.length - 1];

    for (const v of verseNums) {
      if (v < lo || v > hi) continue;
      results.push({
        ref: `${book} ${ch}:${v}`,
        book,
        chapter: ch,
        verse: v,
        text: chapter[String(v)],
      });
    }
  }
  return results;
}

/** 한 장 전체 조회 - [{ref, ...}, ...] 반환 */
function getChapter(book, chapter) {
  _ensureLoaded();
  const bookData = _bible.data[book];
  if (!bookData) return [];
  const ch = bookData[String(chapter)];
  if (!ch) return [];

  return Object.keys(ch)
    .map((n) => parseInt(n, 10))
    .sort((a, b) => a - b)
    .map((v) => ({
      ref: `${book} ${chapter}:${v}`,
      book,
      chapter: Number(chapter),
      verse: v,
      text: ch[String(v)],
    }));
}

/** 책 이름 리스트 */
function listBooks() {
  _ensureLoaded();
  return _bible.books.slice();
}

/** 특정 책의 장 수 */
function chapterCount(book) {
  _ensureLoaded();
  const b = _bible.data[book];
  if (!b) return 0;
  return Object.keys(b).length;
}

/** 포맷 헬퍼: 범위 조회 결과를 사람이 읽기 좋은 문자열로 */
function formatRange(items, { withRef = true, separator = "\n" } = {}) {
  return items
    .map((it) => (withRef ? `${it.ref}  ${it.text}` : it.text))
    .join(separator);
}

module.exports = {
  load,
  setData,
  parseReference,
  getVerse,
  getRange,
  getChapter,
  listBooks,
  chapterCount,
  formatRange,
};
