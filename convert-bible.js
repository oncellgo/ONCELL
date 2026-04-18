/**
 * 개역한글 bible.txt -> bible.json 변환 스크립트
 *
 * 입력 형식 (탭 구분): "책이름 장:절\t본문"
 *   예) "창세기 1:1\t태초에 하나님이 천지를 창조하시니라 !"
 *
 * 출력 형식 (중첩 구조):
 *   {
 *     "books": ["창세기", "출애굽기", ...],      // 파일에 등장한 순서
 *     "data": {
 *       "창세기": {
 *         "1": { "1": "태초에 ...", "2": "땅이 ..." },
 *         "2": { ... }
 *       },
 *       ...
 *     }
 *   }
 *
 * 사용법:  node convert-bible.js <입력경로> [출력경로]
 */

const fs = require("fs");
const path = require("path");

const inputPath = process.argv[2] || "bible.txt";
const outputPath = process.argv[3] || "bible.json";

// "창세기 1:1" / "예레미야 애가 1:1" 처럼 책이름에 공백이 들어가는 경우까지 처리
// 오른쪽 끝의 "<숫자>:<숫자>"를 장/절로 떼어내고 나머지를 책이름으로 본다.
const REF_RE = /^(.+)\s+(\d+):(\d+)$/;

// 원본 txt의 책 이름을 lib/bible.ts의 표준 이름으로 정규화.
const BOOK_NAME_MAP = {
  "예레미야 애가": "예레미야애가",
  "요한1서": "요한일서",
  "요한2서": "요한이서",
  "요한3서": "요한삼서",
};

function convert() {
  const raw = fs.readFileSync(inputPath, "utf8");
  const lines = raw.split(/\r?\n/);

  const data = {};
  const books = [];
  let skipped = 0;
  let total = 0;

  // 원본 txt의 버그 대응: 디모데후서가 "디모데전서"로 잘못 라벨링되어
  // 디모데전서 1:1이 두 번째로 등장한 시점 이후는 실제 디모데후서이다.
  // 한 번 리라우팅이 시작되면 이후 "디모데전서" 라벨은 모두 "디모데후서"로 교정한다.
  let rerouteTimothy = false;

  for (const line of lines) {
    if (!line.trim()) continue;

    const tabIdx = line.indexOf("\t");
    if (tabIdx === -1) {
      skipped++;
      continue;
    }

    const ref = line.slice(0, tabIdx).trim();
    const text = line.slice(tabIdx + 1).trim();

    const m = REF_RE.exec(ref);
    if (!m) {
      skipped++;
      continue;
    }

    let book = m[1].trim();
    const chapter = m[2];
    const verse = m[3];

    if (BOOK_NAME_MAP[book]) book = BOOK_NAME_MAP[book];

    if (book === "디모데전서") {
      if (!rerouteTimothy && chapter === "1" && verse === "1" && data["디모데전서"]?.["1"]?.["1"]) {
        rerouteTimothy = true;
      }
      if (rerouteTimothy) book = "디모데후서";
    }

    if (!data[book]) {
      data[book] = {};
      books.push(book);
    }
    if (!data[book][chapter]) data[book][chapter] = {};
    data[book][chapter][verse] = text;
    total++;
  }

  // lib/bible.ts의 포맷 A에 맞춰 `books`는 중첩 객체로 출력한다.
  // 책의 등장 순서는 `order` 필드로 함께 보존.
  const result = { order: books, books: data };
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 0), "utf8");

  console.log(`변환 완료: ${outputPath}`);
  console.log(`  - 책 수: ${books.length}`);
  console.log(`  - 구절 수: ${total}`);
  if (skipped) console.log(`  - 건너뛴 줄: ${skipped}`);
  console.log(`  - 파일 크기: ${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(2)} MB`);
}

convert();
