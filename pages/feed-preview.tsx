import Head from 'next/head';
import { useState } from 'react';
import { useIsMobile } from '../lib/useIsMobile';
import { Card, CardContent, CardFooter, CardHeader } from '../components/ui/card';
import { Avatar, AvatarFallback } from '../components/ui/avatar';
import { Button } from '../components/ui/button';

type Meditation = {
  id: string;
  nickname: string;
  initial: string;
  hue: number;
  cellType: '큐티셀' | '통독셀' | '암송셀';
  passage: string;
  body: string;
  publishedAt: string;
  prayCount: number;
};

const MOCK: Meditation[] = [
  {
    id: 'm1',
    nickname: '한밤별',
    initial: '한',
    hue: 200,
    cellType: '큐티셀',
    passage: '마태복음 5:3-4',
    body: '"심령이 가난한 자는 복이 있나니"가 오늘은 다르게 읽혔다. 가난을 부끄러워하지 말라가 아니라, 내 안의 텅 빈 자리를 인정하라는 초대로. 채워야 할 것들의 목록을 잠시 내려놓는다.',
    publishedAt: '2시간 전',
    prayCount: 24,
  },
  {
    id: 'm2',
    nickname: '새벽이슬',
    initial: '새',
    hue: 140,
    cellType: '통독셀',
    passage: '시편 23편',
    body: '"내가 사망의 음침한 골짜기로 다닐지라도" — 이 한 줄이 오늘 하루를 견디게 한다. 골짜기를 피하게 해달라는 기도가 아니라, 함께 걸어달라는 기도로 바꿔본다.',
    publishedAt: '4시간 전',
    prayCount: 41,
  },
  {
    id: 'm3',
    nickname: '빛여울',
    initial: '빛',
    hue: 30,
    cellType: '암송셀',
    passage: '빌립보서 4:6-7',
    body: '"아무것도 염려하지 말고" 외워봤다. 입으로는 외우는데 마음은 어제의 통화 한 통에 묶여있다. 외움과 살아냄 사이의 거리를 인정하는 것부터가 시작인 듯.',
    publishedAt: '6시간 전',
    prayCount: 17,
  },
  {
    id: 'm4',
    nickname: '작은풀',
    initial: '작',
    hue: 280,
    cellType: '큐티셀',
    passage: '누가복음 15:11-32',
    body: '돌아온 아들의 이야기. 오늘은 큰아들에게 마음이 갔다. 늘 옆에 있었던 사람의 서운함. 아버지가 큰아들에게 나간 장면이 너무 다정해서 한참을 멈췄다.',
    publishedAt: '8시간 전',
    prayCount: 33,
  },
  {
    id: 'm5',
    nickname: '모래알',
    initial: '모',
    hue: 350,
    cellType: '통독셀',
    passage: '창세기 1:1-5',
    body: '"태초에"로 시작하는 한 줄. 매번 통독을 시작할 때마다 같은 문장인데 다르게 읽힌다. 올해는 "태초"라는 말이 위로가 된다. 시작이 있다는 게.',
    publishedAt: '10시간 전',
    prayCount: 12,
  },
  {
    id: 'm6',
    nickname: '첫걸음',
    initial: '첫',
    hue: 95,
    cellType: '큐티셀',
    passage: '요한복음 21:15-17',
    body: '베드로에게 세 번 물으신 "네가 나를 사랑하느냐". 부활 후의 회복. 실패를 덮어주는 사랑이 아니라, 실패를 마주 보게 하는 사랑이다.',
    publishedAt: '어제',
    prayCount: 58,
  },
];

const cellColor: Record<Meditation['cellType'], string> = {
  큐티셀: 'bg-cyan-300/15 text-cyan-200 border-cyan-300/30',
  통독셀: 'bg-violet-300/15 text-violet-200 border-violet-300/30',
  암송셀: 'bg-amber-300/15 text-amber-200 border-amber-300/30',
};

export default function FeedPreview() {
  const isMobile = useIsMobile();
  const [prayed, setPrayed] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<string | null>(null);

  const togglePray = (id: string) => {
    setPrayed((p) => ({ ...p, [id]: !p[id] }));
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  const handleShare = async (m: Meditation) => {
    const shareUrl = `https://oncell.org/feed/${m.id}`;
    const shareText = `${m.passage}\n\n${m.body}\n\n— ${m.nickname} (ONCELL ${m.cellType})`;
    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      try {
        await (navigator as any).share({ title: `ONCELL · ${m.passage}`, text: shareText, url: shareUrl });
        return;
      } catch {}
    }
    try {
      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
      showToast('링크 복사됨');
    } catch {
      showToast('공유 실패');
    }
  };

  return (
    <>
      <Head>
        <title>오늘의 묵상 · ONCELL</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main className="mx-auto" style={{ maxWidth: 620, padding: isMobile ? '1rem 0.85rem 4rem' : '2rem 1.5rem 5rem', color: '#fff' }}>

        <a href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.85rem', minHeight: 36, borderRadius: 999, background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.78)', fontSize: '0.82rem', textDecoration: 'none', marginBottom: '1.25rem', fontWeight: 600 }}>
          ← 홈으로
        </a>

        <header className="mb-6">
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white mb-1.5">
            오늘의 묵상
          </h1>
          <p className="text-sm text-white/60">
            셀원들이 나눈 큐티 중 관리자가 골라 보여드려요. 24시간 후 다음 묵상으로 바뀝니다.
          </p>
        </header>

        <div className="flex flex-col gap-3.5">
          {MOCK.map((m) => (
            <Card key={m.id} className="bg-white/[0.04] border-white/10 backdrop-blur-sm">

              <CardHeader className="flex flex-row items-center gap-3 p-4 pb-2">
                <Avatar style={{ background: `hsl(${m.hue} 70% 60% / 0.25)` }}>
                  <AvatarFallback style={{ background: `hsl(${m.hue} 60% 55% / 0.5)`, color: '#fff', fontWeight: 700 }}>
                    {m.initial}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-semibold text-white text-sm">{m.nickname}</span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${cellColor[m.cellType]}`}>
                      {m.cellType}
                    </span>
                  </div>
                  <div className="text-xs text-white/50 mt-0.5">
                    {m.publishedAt} · {m.passage}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="px-4 pb-3 pt-1">
                <p className="text-[0.95rem] leading-[1.75] text-white/85 whitespace-pre-wrap break-keep">
                  {m.body}
                </p>
              </CardContent>

              <CardFooter className="px-2 pb-2 pt-0 gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => togglePray(m.id)}
                  className={`text-white/75 hover:bg-white/10 hover:text-white ${prayed[m.id] ? 'text-cyan-200' : ''}`}
                >
                  <span className="mr-1.5">🙏</span>
                  <span className="text-xs font-medium">기도해요 {m.prayCount + (prayed[m.id] ? 1 : 0)}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleShare(m)}
                  className="text-white/75 hover:bg-white/10 hover:text-white"
                >
                  <span className="mr-1.5">↗</span>
                  <span className="text-xs font-medium">공유</span>
                </Button>
                <div className="flex-1" />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => showToast('저장 기능은 곧 열려요')}
                  className="text-white/60 hover:bg-white/10 hover:text-white h-9 w-9"
                  aria-label="저장"
                >
                  <span className="text-base">🔖</span>
                </Button>
              </CardFooter>

            </Card>
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-white/40">
          이건 디자인 시안입니다. 실제 묵상은 베타 오픈 후 셀원들의 글로 채워집니다.
        </p>

        {toast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-full bg-white text-[#2D3850] text-sm font-semibold shadow-lg z-50">
            {toast}
          </div>
        )}
      </main>
    </>
  );
}
