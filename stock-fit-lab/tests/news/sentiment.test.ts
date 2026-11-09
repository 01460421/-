import { describe, it, expect } from 'vitest';
import { aggregateDaily, scoreHeadline, tagHeadline, SENTIMENT_LEXICON } from '@/lib/news/sentiment';

describe('標題情緒詞典', () => {
  it('詞典檔有說明、方法與出處', () => {
    expect(SENTIMENT_LEXICON.description).toContain('粗略');
    expect(SENTIMENT_LEXICON.method).toContain('(pos − neg) / (pos + neg)');
    expect(SENTIMENT_LEXICON.reference).toContain('Tetlock');
    expect(SENTIMENT_LEXICON.positive.zh).toContain('利多');
    expect(SENTIMENT_LEXICON.negative.zh).toContain('裁員');
  });

  it('中文正向：利多 + 創新高 → +1', () => {
    const s = scoreHeadline('台積電法說會釋利多 股價創新高');
    expect(s.pos).toBe(2);
    expect(s.neg).toBe(0);
    expect(s.score).toBe(1);
    expect(s.matched).toEqual(expect.arrayContaining(['利多', '創新高']));
  });

  it('最長詞優先：「創新高」不重複計「新高」', () => {
    const s = scoreHeadline('營收創新高');
    expect(s.pos).toBe(1);
  });

  it('正負混合：(1 − 2) / 3', () => {
    const s = scoreHeadline('營收成長但毛利率下修 外資降評');
    expect(s.pos).toBe(1);
    expect(s.neg).toBe(2);
    expect(s.score).toBeCloseTo(-1 / 3, 3);
  });

  it('否定詞反轉：「不看好」為負向', () => {
    const s = scoreHeadline('分析師不看好下半年');
    expect(s.neg).toBe(1);
    expect(s.pos).toBe(0);
    expect(s.matched[0]).toBe('否定:看好');
  });

  it('英文完整單字與否定', () => {
    expect(scoreHeadline('Apple beats estimates and raises dividend').score).toBe(1);
    expect(scoreHeadline('Intel misses, announces layoffs').neg).toBe(2);
    const neg = scoreHeadline('Chipmaker did not beat expectations');
    expect(neg.neg).toBe(1);
    expect(neg.pos).toBe(0);
    // 子字串不算：'recordings' 不等於 'record'
    expect(scoreHeadline('Recordings released').pos).toBe(0);
  });

  it('沒有命中詞時為 0', () => {
    expect(scoreHeadline('公告本公司董事會決議事項').score).toBe(0);
  });

  it('每日彙總：平均分數與媒體悲觀度', () => {
    const items = [
      { title: '營收創新高', d: '2024-01-18' },
      { title: '裁員 虧損', d: '2024-01-18' },
      { title: 'Apple beats', d: '2024-01-19' },
    ];
    const daily = aggregateDaily(items, (x) => x.d);
    expect(daily).toEqual([
      { date: '2024-01-18', count: 2, meanScore: 0, pos: 1, neg: 2, pessimism: 0.667 },
      { date: '2024-01-19', count: 1, meanScore: 1, pos: 1, neg: 0, pessimism: 0 },
    ]);
  });

  it('標題標籤：總經 / 方針 / 股利', () => {
    expect(tagHeadline('Fed raises interest rate')).toContain('macro');
    expect(tagHeadline('台積電上修資本支出')).toContain('guidance');
    expect(tagHeadline('董事會決議配息 3.5 元')).toContain('dividend');
  });
});
