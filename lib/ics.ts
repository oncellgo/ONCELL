/**
 * 최소한의 iCalendar(RFC 5545) 빌더.
 * Google Calendar "URL로 구독" 엔드포인트에서 사용합니다.
 */

export type IcsEvent = {
  id: string;
  title: string;
  startAt: string; // ISO 8601
  endAt: string;   // ISO 8601
  location?: string;
  description?: string;
  createdAt?: string;
  rrule?: string;  // 예: 'FREQ=WEEKLY;UNTIL=20351231T235959Z'
};

const pad2 = (n: number) => String(n).padStart(2, '0');

const toUtcStamp = (iso: string) => {
  const d = new Date(iso);
  return (
    d.getUTCFullYear().toString() +
    pad2(d.getUTCMonth() + 1) +
    pad2(d.getUTCDate()) +
    'T' +
    pad2(d.getUTCHours()) +
    pad2(d.getUTCMinutes()) +
    pad2(d.getUTCSeconds()) +
    'Z'
  );
};

const escapeText = (s: string) =>
  s
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');

// RFC5545는 한 라인 최대 75 octet — 간단히 75자 기준으로 접기
const fold = (line: string) => {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let rest = line;
  chunks.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 74) {
    chunks.push(' ' + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  if (rest.length) chunks.push(' ' + rest);
  return chunks.join('\r\n');
};

export const buildIcs = (opts: {
  calendarName: string;
  events: IcsEvent[];
  host?: string;
}): string => {
  const host = opts.host || 'oncell.app';
  const now = toUtcStamp(new Date().toISOString());
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ONCELL//KO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    fold(`X-WR-CALNAME:${escapeText(opts.calendarName)}`),
    'X-WR-TIMEZONE:Asia/Seoul',
  ];

  for (const ev of opts.events) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${ev.id}@${host}`);
    lines.push(`DTSTAMP:${toUtcStamp(ev.createdAt || new Date().toISOString())}`);
    lines.push(`DTSTART:${toUtcStamp(ev.startAt)}`);
    lines.push(`DTEND:${toUtcStamp(ev.endAt)}`);
    lines.push(fold(`SUMMARY:${escapeText(ev.title)}`));
    if (ev.location) lines.push(fold(`LOCATION:${escapeText(ev.location)}`));
    if (ev.description) lines.push(fold(`DESCRIPTION:${escapeText(ev.description)}`));
    if (ev.rrule) lines.push(fold(`RRULE:${ev.rrule}`));
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  lines.push(''); // trailing CRLF
  return lines.join('\r\n');
};
