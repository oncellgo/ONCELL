import type { NextApiRequest, NextApiResponse } from 'next';
import { getQtNotes } from '../../lib/dataStore';

// ---------------------------------------------------------------
// GET /api/qt-notes-export?profileId=X&nickname=Y
// 내 QT 묵상 기록 전체를 .txt 로 다운로드.
// - 탈퇴 전 "내 기록 보관" 용도로 주로 사용.
// - UTF-8 BOM 포함 (Windows 메모장 한글 호환).
// ---------------------------------------------------------------

type QtNote = {
  profileId: string;
  date: string;
  reference: string | null;
  feelings: string;
  decision: string;
  prayer: string;
  updatedAt: string;
};

const divider = '───────────────────────';

const formatNote = (n: QtNote): string => {
  const out: string[] = [];
  out.push(divider);
  out.push(`[${n.date}]`);
  if (n.reference) out.push(`말씀: ${n.reference}`);
  out.push('');
  if (n.feelings?.trim()) {
    out.push('⟨느낀 점⟩');
    out.push(n.feelings.trim());
    out.push('');
  }
  if (n.decision?.trim()) {
    out.push('⟨나의 결단⟩');
    out.push(n.decision.trim());
    out.push('');
  }
  if (n.prayer?.trim()) {
    out.push('⟨기도 제목⟩');
    out.push(n.prayer.trim());
    out.push('');
  }
  return out.join('\n');
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const profileId = typeof req.query.profileId === 'string' ? req.query.profileId.trim() : '';
  if (!profileId) {
    return res.status(400).json({ error: 'profileId required' });
  }

  try {
    const all = await getQtNotes();
    const mine: QtNote[] = (Array.isArray(all) ? (all as QtNote[]) : [])
      .filter((n) => n.profileId === profileId)
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    const nickname = typeof req.query.nickname === 'string' ? req.query.nickname.trim() : '';
    const today = new Date().toISOString().slice(0, 10);

    const headerLines = [
      '=== 나의 묵상 기록 (ONCELL) ===',
      nickname ? `작성자: ${nickname}` : '',
      `총 ${mine.length}편`,
      `내보낸 날짜: ${today}`,
      '',
    ].filter(Boolean);

    const body = mine.length === 0
      ? '(아직 작성된 묵상 기록이 없습니다.)\n'
      : mine.map(formatNote).join('');

    // UTF-8 BOM 으로 Windows 메모장에서 한글 깨짐 방지.
    const content = '﻿' + headerLines.join('\n') + '\n' + body;
    const filename = `kcis-qt-${today}.txt`;

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).send(content);
  } catch (e) {
    console.error('[qt-notes-export] failed', e);
    return res.status(500).json({ error: '묵상 기록 내보내기에 실패했습니다.' });
  }
};

export default handler;
