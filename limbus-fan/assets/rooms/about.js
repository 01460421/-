// 關於：來源、譯名、權利與這本手冊怎麼做。
(function () {
  const LB = window.LB, { esc } = LB;
  LB.room('about', {
    render() {
      LB.visit('about');
      const A = LB.about || {};
      return {
        title: '關於',
        html: `<section class="wrap page narrow">
          ${LB.pageHead(LB.roomNo('about'), LB.roomColor('about'), '關於這本手冊', '一本給《邊獄巴士》玩家看的非官方手冊。')}
          ${(A.sections || []).map(s => `<section class="prose-sec"><h2>${esc(s.h)}</h2>${s.html || LB.prose(s.p)}</section>`).join('')}
          <section class="prose-sec"><h2>資料整理到</h2><p>${esc(LB.updated.replace('.', ' 年 '))} 月。最新的主線是${esc(LB.cantos.filter(c => !c.side).slice(-1)[0].lab)}。</p></section>
        </section>`,
      };
    },
  });
})();
