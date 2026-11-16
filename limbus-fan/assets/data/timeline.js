// 年表。日期查證過的來源：limbuscompany.wiki.gg、英文維基百科、Steam 的官方公告。
(function () {
  const LB = window.LB;
  LB.timeline = [
    { when: '2016-11', kind: 'studio', t: 'Project Moon 成立', d: '韓國的獨立遊戲工作室。' },
    { when: '2016-12', kind: 'game', t: '《腦葉公司》開始搶先體驗', d: '經營一間收容異想體的公司，從牠們身上提取能源。' },
    { when: '2018-04-09', kind: 'game', t: '《腦葉公司》正式推出', d: 'Lobotomy Corporation。' },
    { when: '2020-05-15', kind: 'game', t: '《廢墟圖書館》開始搶先體驗', d: '腦葉公司倒塌之後，一座把來客變成書的圖書館。' },
    { when: '2021-08-10', kind: 'game', t: '《廢墟圖書館》正式推出', d: 'Library of Ruina。' },
    { when: '2023-02-27', kind: 'game', t: '《邊獄巴士》上線', d: 'Steam、Android、iOS 同時推出，免費遊玩。序章到第三章在開服時就已經上線。', href: '#/route' },
    { when: '2024-11-22', kind: 'collab', t: '公布與《明日方舟》聯動', d: '聯動只在《邊獄巴士》裡進行。' },
    { when: '2025-09-25', kind: 'collab', t: '聯動活動〈善意的巡禮〉', d: '第 8.5 章 EX，舉行到 10 月 23 日；活動結束後劇情就移除了。' },
  ];
  const starts = { 1: '2023-02-27', 2: '2023-06-01', 3: '2023-11-16', 4: '2024-03-28', 5: '2024-10-10', 6: '2025-05-15', 7: '2025-12-31', 8: '2026-09-17' };
  (LB.seasons || []).forEach(s => {
    s.from = starts[s.no];
    const cs = s.cantos.map(n => LB.cantos.find(c => !c.side && c.no === n)).filter(Boolean);
    const last = cs[cs.length - 1];
    LB.timeline.push({
      when: s.from, kind: 'season', t: `第 ${s.no} 季〈${s.name}${s.zh ? '｜' + s.zh : ''}〉開始`,
      d: s.no === 1 ? '開服的第一季，包含序章到第三章。' : `主線${last.lab}〈${last.title}〉同一天上線${s.no === 8 ? '，是目前進行中的一季' : ''}。`,
      href: `#/canto/${last.no}`,
    });
  });
  LB.timelineNote = '季的開始日期對照了 wiki 與 Steam 當天的更新公告；各章從第四章起分三段放出，這裡寫的是第一段上線的日子。';
})();
