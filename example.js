/**
 * bible.js 사용 예시
 *
 * 실행:  node example.js
 */

const bible = require("./bible");
bible.load("./bible.json");

console.log("== 단일 구절 조회 ==");
console.log("창세기 1:1 →", bible.getVerse("창세기 1:1"));
console.log("요한복음 3:16 →", bible.getVerse("요한복음 3:16"));

console.log("\n== 범위 조회 (같은 장) ==");
console.log(
  bible.formatRange(bible.getRange("창세기 1:1-5"))
);

console.log("\n== 범위 조회 (장 경계) ==");
console.log(
  bible.formatRange(bible.getRange("창세기 1:29-2:3"))
);

console.log("\n== 책 이름에 공백이 있는 경우 ==");
console.log("예레미야 애가 3:22 →", bible.getVerse("예레미야 애가 3:22"));

console.log("\n== 메타 정보 ==");
console.log("총 책 수:", bible.listBooks().length);
console.log("시편 장 수:", bible.chapterCount("시편"));
console.log("첫 5개 책:", bible.listBooks().slice(0, 5));

console.log("\n== 존재하지 않는 구절 ==");
console.log("창세기 100:1 →", bible.getVerse("창세기 100:1")); // null
