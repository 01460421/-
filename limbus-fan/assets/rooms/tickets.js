// 車票簿：乘客章、章節章、房間章、成就章；可以做成一張車票的圖下載。
(function () {
  const LB = window.LB, { esc, $, store: st } = LB, E = window.emblem;

  const stampCell = (got, inner, label, date, href) =>
    `<${href ? `a href="${href}"` : 'div'} class="stamp${got ? ' got' : ''}" title="${esc(label)}${got ? `（${esc(date)}）` : '（還沒蓋）'}">${inner}<span>${esc(label)}</span></${href ? 'a' : 'div'}>`;

  LB.room('tickets', {
    render() {
      LB.visit('tickets');
      const s = LB.stamps();
      const people = LB.sinners.concat(LB.crew.filter(p => p.no));
      const mains = LB.cantos.filter(c => !c.side);
      const n = (pre, list, key) => list.filter(x => s[pre + key(x)]).length;
      return {
        title: '車票簿',
        html: `<section class="wrap page">
          ${LB.pageHead(LB.roomNo('tickets'), LB.roomColor('tickets'), '車票簿', '逛過的個人頁、章節和房間，做過的事，都會在這裡蓋一枚章。紀錄只存在這台裝置的瀏覽器裡；寫上名字，可以把它做成一張車票的圖。')}
          <div class="ticket-maker card">
            <label class="fld wide"><span>乘客名字</span><input type="text" id="tkName" maxlength="16" placeholder="寫在車票上的名字" value="${esc(st.get('name', ''))}"></label>
            <button type="button" class="btn" id="tkMake">做成車票</button>
            <div class="tk-out" id="tkOut"></div>
          </div>
          <h2 class="h2">乘客章 <small>${n('sinner-', people, p => p.id)} / ${people.length}</small></h2>
          <div class="stamps">${people.map(p => stampCell(s['sinner-' + p.id], E(p.emblem), p.zh, s['sinner-' + p.id], `#/sinner/${p.id}`)).join('')}</div>
          <h2 class="h2">章節章 <small>${n('canto-', mains, c => c.no)} / ${mains.length}</small></h2>
          <div class="stamps">${mains.map(c => stampCell(s['canto-' + c.no], `<b class="cn">${c.no === 0 ? '序' : LB.num(c.no)}</b>`, c.title, s['canto-' + c.no], `#/canto/${c.no}`)).join('')}</div>
          <h2 class="h2">房間章 <small>${n('room-', LB.rooms, r => r.id)} / ${LB.rooms.length}</small></h2>
          <div class="stamps">${LB.rooms.map(r => stampCell(s['room-' + r.id], `<i class="dot" style="background:${r.c}"></i>`, r.name, s['room-' + r.id], '#/' + r.id)).join('')}</div>
          <h2 class="h2">成就章 <small>${LB.achievements.filter(a => s[a.id]).length} / ${LB.achievements.length}</small></h2>
          <ul class="achv">${LB.achievements.map(a => `<li class="${s[a.id] ? 'got' : ''}"><b>${esc(a.name)}</b><span>${esc(a.desc)}</span>${s[a.id] ? `<time>${esc(s[a.id])}</time>` : ''}</li>`).join('')}</ul>
        </section>`,
        after: v => {
          $('#tkName', v).addEventListener('input', e => st.set('name', e.target.value.trim()));
          $('#tkMake', v).addEventListener('click', async () => {
            const url = await draw(st.get('name', '') || '無名乘客');
            $('#tkOut', v).innerHTML = `<img src="${url}" alt="你的車票"><a class="btn small" href="${url}" download="邊獄巴士車票.png">下載這張車票</a>`;
          });
        },
      };
    },
  });

  async function draw(name) {
    try { await document.fonts.load('900 60px "Noto Serif TC"'); await document.fonts.load('500 20px "JetBrains Mono"'); } catch (e) { /* 字型載不到就用系統字 */ }
    const W = 1200, H = 520, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const s = LB.stamps(), mains = LB.cantos.filter(c => !c.side), people = LB.sinners.concat(LB.crew.filter(p => p.no));
    // 票面
    g.fillStyle = '#0f0d0c'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#ece2cf';
    const r = 26; g.beginPath(); g.roundRect ? g.roundRect(20, 20, W - 40, H - 40, r) : g.rect(20, 20, W - 40, H - 40); g.fill();
    g.fillStyle = '#0f0d0c'; [[W - 300, 20], [W - 300, H - 20]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 18, 0, Math.PI * 2); g.fill(); });
    g.strokeStyle = '#b9a98f'; g.setLineDash([10, 8]); g.lineWidth = 3; g.beginPath(); g.moveTo(W - 300, 46); g.lineTo(W - 300, H - 46); g.stroke(); g.setLineDash([]);
    // 七色路線
    LB.sins.forEach((x, i) => { g.strokeStyle = x.c; g.lineWidth = 8; g.lineCap = 'round'; g.beginPath(); g.moveTo(70 + i * 112, 96); g.lineTo(70 + (i + 1) * 112 - 14, 96); g.stroke(); });
    g.fillStyle = '#6b5c4b'; g.font = '500 20px "JetBrains Mono", monospace'; g.fillText('LIMBUS COMPANY · 非官方同好站', 70, 66);
    g.fillStyle = '#2a2119'; g.font = '900 64px "Noto Serif TC", serif'; g.fillText('邊獄巴士乘客手冊', 66, 182);
    g.font = '700 40px "Noto Serif TC", serif'; g.fillText(name.slice(0, 16), 70, 262);
    g.fillStyle = '#6b5c4b'; g.font = '500 24px "Noto Sans TC", sans-serif';
    const lines = [
      `劇透進度：${LB.progressLabel(LB.progress())}`,
      `乘客章 ${people.filter(p => s['sinner-' + p.id]).length}/${people.length}　章節章 ${mains.filter(c => s['canto-' + c.no]).length}/${mains.length}　成就章 ${LB.achievements.filter(a => s[a.id]).length}/${LB.achievements.length}`,
      `測驗最佳 ${LB.store.get('quizBest', 0)} 題　連續來訪 ${LB.store.get('streak', 1)} 天`,
    ];
    lines.forEach((t, i) => g.fillText(t, 70, 322 + i * 40));
    g.font = '500 18px "JetBrains Mono", monospace'; g.fillText('limbus-handbook.vercel.app', 70, 460);
    // 存根
    let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    g.fillStyle = '#6b5c4b'; g.font = '500 20px "JetBrains Mono", monospace'; g.textAlign = 'center';
    g.fillText('ADMIT ONE', W - 160, 120);
    g.fillStyle = '#2a2119'; g.font = '700 54px "JetBrains Mono", monospace'; g.fillText('No.' + (14 + (h % 86)), W - 160, 200);
    g.fillStyle = '#6b5c4b'; g.font = '500 22px "Noto Sans TC", sans-serif'; g.fillText(LB.today(), W - 160, 250);
    for (let x = 0, i = 0; x < 200; i++) { const w = 1 + ((h >> (i % 24)) & 3); g.fillStyle = '#2a2119'; g.fillRect(W - 260 + x, 300, w, 120); x += w + 2 + ((h >> ((i + 7) % 24)) & 1) * 2; }
    g.textAlign = 'left';
    return cv.toDataURL('image/png');
  }
})();
