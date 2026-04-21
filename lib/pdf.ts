/**
 * pdf-parse v2 로더 — Node 런타임에서 pdfjs-dist v5 호환 polyfill 포함.
 *
 * pdf-parse@2.4.5 → pdfjs-dist@5.x 는 `DOMMatrix` · `Path2D` · `ImageData` 같은
 * 브라우저 Web API 전역이 있어야 로드됨. Vercel serverless(Node 20)는 이게 없어서
 * `ReferenceError: DOMMatrix is not defined` 로 모듈 require 자체가 실패.
 *
 * `@napi-rs/canvas` (pdf-parse 의존성)가 이 심볼들을 Node로 제공하므로 전역에 주입.
 */

/* eslint-disable @typescript-eslint/no-var-requires */
const injectCanvasGlobals = () => {
  const g = globalThis as any;
  if (g.__kcisCanvasPolyfilled) return;
  try {
    const canvas = require('@napi-rs/canvas');
    const names = ['DOMMatrix', 'DOMPoint', 'DOMRect', 'Path2D', 'ImageData'];
    for (const n of names) {
      if (typeof g[n] === 'undefined' && canvas[n]) g[n] = canvas[n];
    }
    g.__kcisCanvasPolyfilled = true;
  } catch (e) {
    console.error('[pdf] @napi-rs/canvas polyfill failed:', e);
  }
};

injectCanvasGlobals();

type PDFParseModule = {
  PDFParse: new (opts: { data: Buffer }) => { getText: () => Promise<{ text: string }> };
};

const { PDFParse } = require('pdf-parse') as PDFParseModule;

export { PDFParse };

export const extractPdfText = async (buf: Buffer): Promise<string> => {
  const parser = new PDFParse({ data: buf });
  const parsed = await parser.getText();
  return (parsed?.text || '').trim();
};
