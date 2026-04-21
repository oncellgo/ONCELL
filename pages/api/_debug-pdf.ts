import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * pdf-parse 로딩·파싱 각 단계를 분리 테스트하는 진단 엔드포인트.
 * /api/_debug-pdf?step=1(require) | 2(fetch) | 3(parse)
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const step = typeof req.query.step === 'string' ? req.query.step : '0';
  const log: Array<{ name: string; ok: boolean; note?: string }> = [];

  // Step 1: pdf-parse 모듈 로드
  let PDFParse: any = null;
  try {
    const mod = require('pdf-parse');
    PDFParse = mod.PDFParse;
    log.push({ name: 'require(pdf-parse)', ok: true, note: `PDFParse=${typeof PDFParse}` });
  } catch (e: any) {
    log.push({ name: 'require(pdf-parse)', ok: false, note: `${e?.message}\n${e?.stack?.split('\n').slice(0, 5).join('\n')}` });
    return res.status(200).json({ ok: false, log, node: process.version });
  }

  if (step === '1') return res.status(200).json({ ok: true, log, node: process.version });

  // Step 2: PDF 다운로드
  let buf: Buffer | null = null;
  try {
    const pdfRes = await fetch('https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf');
    if (!pdfRes.ok) throw new Error(`http ${pdfRes.status}`);
    buf = Buffer.from(await pdfRes.arrayBuffer());
    log.push({ name: 'fetch dummy.pdf', ok: true, note: `${buf.length} bytes, head=${buf.slice(0, 4).toString('hex')}` });
  } catch (e: any) {
    log.push({ name: 'fetch dummy.pdf', ok: false, note: e?.message });
    return res.status(200).json({ ok: false, log, node: process.version });
  }

  if (step === '2') return res.status(200).json({ ok: true, log, node: process.version });

  // Step 3: PDF 파싱
  try {
    const parser = new PDFParse({ data: buf });
    const parsed = await parser.getText();
    log.push({ name: 'parser.getText()', ok: true, note: `text length=${(parsed?.text || '').length}` });
  } catch (e: any) {
    log.push({ name: 'parser.getText()', ok: false, note: `${e?.message}\n${e?.stack?.split('\n').slice(0, 5).join('\n')}` });
    return res.status(200).json({ ok: false, log, node: process.version });
  }

  return res.status(200).json({ ok: true, log, node: process.version });
}
