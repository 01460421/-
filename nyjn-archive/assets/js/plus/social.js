'use strict';
/* ---------- 共用的部分：共鳴、回報、即時更新、公開推測、同好的統計、館內動態 ----------
   只有接上 v2 後端時才出現；單機模式下這個檔案幾乎什麼都不做。 */
(function () {
  const A = window.__A, K = A.K, { $, Case, toast, Board, Api, pad } = A;
  const soc = () => K.bag('soc', { rx: {}, fl: {}, n: { relay: 0, works: 0, theory: 0 }, draft: {}, pub: {}, votes: '' });
  const live = () => Board.mode === 'api' && Api.v >= 2;
  const RX = [['a', '撐傘'], ['b', '記下'], ['c', '想看下去']];
  const RELAY_K = RELAYS.map(r => r.k);
  let pulse = null, pulseAt = 0, pulseBusy = null;
  const seenT = {}, known = {};

  /* ---- 共鳴 ---- */
  function rxRow(it) {
    const row = K.h('div.rx', { role: 'group', 'aria-label': '共鳴' }), mine = soc().rx[it.id] || '', r = it.r || { a: 0, b: 0, c: 0 };
    RX.forEach(x => {
      const b = K.h('button', { type: 'button', 'aria-pressed': mine === x[0] ? 'true' : 'false' }, x[1], K.h('i', { text: String(r[x[0]] | 0) }));
      b.onclick = async () => {
        const prev = soc().rx[it.id] || '', next = prev === x[0] ? '' : x[0], before = Object.assign({ a: 0, b: 0, c: 0 }, it.r);
        row.querySelectorAll('button').forEach(z => { z.disabled = true; });
        const opt = Object.assign({}, before); if (prev) opt[prev] = Math.max(0, opt[prev] - 1); if (next) opt[next]++;
        if (next) soc().rx[it.id] = next; else delete soc().rx[it.id];
        Board.patch(it.k, it.id, o => { o.r = opt; });
        try { const out = await Api.react(it.k, it.id, next); Case.save(); Board.patch(it.k, it.id, o => { o.r = out.r; }); if (A.Snd) A.Snd.cue('tick'); }
        catch (e) { if (prev) soc().rx[it.id] = prev; else delete soc().rx[it.id]; Board.patch(it.k, it.id, o => { o.r = before; }); toast(e.message || '沒有送出去'); }
      };
      row.append(b);
    });
    return row;
  }
  function reportBtn(it) {
    const b = K.h('button.tiny', { type: 'button', text: '回報' });
    b.onclick = async () => {
      if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = '確定回報這一則不妥'; return; }
      b.disabled = true;
      try { await Api.report(it.k, it.id); soc().fl[it.id] = 1; Case.save(); Board.gone[it.id] = 1; Board.changed(); toast('已回報，這一則不會再顯示給你'); }
      catch (e) { b.disabled = false; toast(e.message || '回報失敗'); }
    };
    return b;
  }
  A.on('item', ({ it, li, body, ops, kind }) => {
    if (it.src !== 'api' || !live()) return;
    if (kind === 'wall' && it.pin) body.prepend(K.h('span.pinned-tag', { text: '館方選件' }));
    if (Board.has('react')) ops.before(rxRow(it));
    if (!it.mine && Board.has('report')) ops.append(reportBtn(it));
    if (seenT[it.k] && it.t > seenT[it.k] && !it.mine && li.classList) li.classList.add('fresh');
  });
  A.on('board', () => { Object.keys(soc().fl).forEach(id => { Board.gone[id] = 1; }); const n = $('foot-net'); if (n) n.textContent = Board.mode === 'api' ? '共用後端已連上' : Board.mode === 'claude' ? '已連上共用的本子' : '單機模式'; });

  /* ---- 即時更新：人在房間裡、分頁在前景時，每隔一陣子問一次 ---- */
  /* 直接開在某個房間時，後端可能比房間晚一步連上：連上之後補抓一次 */
  A.on('board', () => {
    if (Board.mode !== 'api') return;
    if (A.cur === 'relay') Board.load(A.relayK); else if (A.cur === 'studio') Board.load('gallery'); else if (A.cur === 'questions') Board.load('theory');
  });
  const wallOpen = () => !!document.querySelector('#studio-tabs button[data-t="wall"][aria-pressed="true"]');
  setInterval(() => {
    if (!live() || document.hidden) return;
    if (A.cur === 'relay') Board.load(A.relayK);
    else if (A.cur === 'studio' && wallOpen()) Board.load('gallery');
    else if (A.cur === 'questions') Board.load('theory');
  }, 25000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && live() && A.cur === 'relay') Board.load(A.relayK); });
  A.on('loaded', k => {
    const items = Board.cache[k] || [], n = items.length, others = items.filter(x => !Case.d.ids[x.id]).length;
    if (known[k] != null && others > known[k].others && A.cur === 'relay' && k === A.relayK) toast('有新的段落接上了');
    known[k] = { n, others };
    if (k === 'theory') theoryPaint();
  });
  A.on('relayPainted', ({ k }) => { const a = Board.cache[k] || []; setTimeout(() => { seenT[k] = a.reduce((m, x) => Math.max(m, +x.t || 0), seenT[k] || 1); }, 2600); });

  /* ---- 接龍：草稿與提示 ---- */
  const PROMPTS = ['寫一個聲音。', '讓一樣東西往回走。', '有人敲門。', '加進一個年份。', '這一段只寫對話。', '從氣味寫起。', '讓上一段出現過的東西再出現一次。', '有人說了謊。', '寫一句來不及說出口的話。', '把鏡頭拉遠，看整條街。', '出現一封信。', '雨快來了，有人還不知道。'];
  A.on('ready', () => {
    const ta = $('relay-x'), form = $('relay-form'); if (!ta || !form) return;
    const save = K.debounce(() => { const k = A.relayK, v = ta.value; if (v.trim()) soc().draft[k] = v.slice(0, 240); else delete soc().draft[k]; Case.save(); }, 500);
    ta.addEventListener('input', save);
    const line = K.h('p.prompt-line', { 'aria-live': 'polite' });
    const b = K.h('button.tiny', { type: 'button', text: '抽一張提示' }); b.onclick = () => { line.textContent = '提示　' + PROMPTS[Math.floor(Math.random() * PROMPTS.length)]; ta.focus(); };
    form.after(K.h('div.relay-tools', K.h('span.lab', { text: '接不下去？' }), b), line);
  });
  A.on('relayHead', ({ k }) => {
    const ta = $('relay-x'); if (!ta || ta.dataset.k === k) return;
    ta.dataset.k = k; ta.value = soc().draft[k] || ''; $('relay-n').textContent = ta.value.length + ' ／ 240';
    const R = RELAYS.find(r => r.k === k); try { history.replaceState(null, '', '#relay/' + k); } catch (e) { /* 忽略 */ }
    if (R) ta.placeholder = '從上一段的最後一句接著寫';
  });
  A.on('relaySent', ({ k }) => { delete soc().draft[k]; Case.save(); });
  A.on('posted', ({ k }) => { const n = soc().n; if (RELAY_K.indexOf(k) >= 0) n.relay = (n.relay | 0) + 1; else if (k === 'gallery') n.works = (n.works | 0) + 1; else if (k === 'theory') n.theory = (n.theory | 0) + 1; Case.save(); pulseAt = 0; });

  /* ---- 未解之謎：公開推測 ---- */
  const TH = {};   // q.id → {card, ta, pub, more, list, open}
  A.on('question', ({ q, card, ta }) => {
    const pub = K.h('button.tiny', { type: 'button', hidden: true }), more = K.h('button.tiny', { type: 'button', hidden: true, 'aria-expanded': 'false' }), list = K.h('div.th-list', { hidden: true });
    const o = TH[q.id] = { q, card, ta, pub, more, list, open: false };
    pub.onclick = async () => {
      const mineId = soc().pub[q.id], mine = mineId && Board.shared('theory').find(x => x.id === String(mineId));
      pub.disabled = true;
      try {
        if (mine) { await Board.remove(mine); delete soc().pub[q.id]; Case.save(); toast('已撤回公開的推測'); }
        else {
          const x = ta.value.trim().slice(0, 400); if (!x) { toast('先寫下你的推測'); ta.focus(); pub.disabled = false; return; }
          const it = await Board.post('theory', { q: q.id, x }); if (it && it.id) { soc().pub[q.id] = it.id; Case.save(); }
          toast('推測已公開'); o.open = true;
        }
      } catch (e) { toast(e.message === 'local' ? '目前是單機模式，沒辦法公開' : (e.message || '沒有送出去')); }
      pub.disabled = false; theoryPaint();
    };
    more.onclick = () => { o.open = !o.open; theoryPaint(); };
    card.append(K.h('div.th-pub', pub, more), list);
  });
  function theoryPaint() {
    const on = live() && Board.cache.theory !== undefined, all = on ? Board.shared('theory') : [];
    Object.keys(TH).forEach(id => {
      const o = TH[id], items = all.filter(x => x.q === id).sort((a, b) => { const s = x => x.r ? x.r.a + x.r.b + x.r.c : 0; return (s(b) - s(a)) || (b.t - a.t); });
      const mineId = soc().pub[id], mine = mineId && items.some(x => x.id === String(mineId));
      o.pub.hidden = !live(); o.pub.textContent = mine ? '撤回我公開的推測' : '公開這則推測（四百字以內）';
      o.more.hidden = !on || !items.length; o.more.textContent = (o.open ? '收起' : '看') + '其他司辰的推測（' + items.length + '）'; o.more.setAttribute('aria-expanded', o.open ? 'true' : 'false');
      o.list.hidden = !o.open || !items.length; o.list.textContent = '';
      if (o.list.hidden) return;
      items.forEach(it => {
        const ops = K.h('div.ops'), box = K.h('div.th-item', K.h('div.who', K.h('b', { text: it.name || '無名的司辰' }), K.ago(it.t) + (it.mine ? '　你' : '')), K.h('p', { text: it.x }), ops);
        if (Board.canMod(it) && !it.mine) { const rm = K.h('button.tiny', { type: 'button', text: '刪除' }); rm.onclick = async () => { if (rm.dataset.sure !== '1') { rm.dataset.sure = '1'; rm.textContent = '確定刪除'; return; } try { await Board.remove(it); toast('已刪除'); } catch (e) { toast(e.message || '刪除失敗'); } }; ops.append(rm); }
        o.list.append(box); A.emit('item', { it, li: box, body: box, ops, kind: 'theory' });
      });
    });
  }
  A.on('questions', () => { if (live()) Board.load('theory'); theoryPaint(); });
  Board.subs.add(() => { if (A.cur === 'questions') theoryPaint(); });

  /* ---- 同好的統計：抉擇的比例、暴雨的分佈 ---- */
  async function getPulse(force) {
    if (!live() || !Board.has('pulse')) return null;
    if (!force && pulse && Date.now() - pulseAt < 60000) return pulse;
    if (pulseBusy) return pulseBusy;
    pulseBusy = Api.pulse().then(j => { pulse = j; pulseAt = Date.now(); pulseBusy = null; A.emit('pulse', j); return j; }).catch(() => { pulseBusy = null; return pulse; });
    return pulseBusy;
  }
  const sig = () => SC.map(s => Case.d.choices[s.id] || '-').join('') + '|' + (Case.d.mine ? Case.d.mine.storm : -1);
  const EMPTY_SIG = SC.map(() => '-').join('') + '|-1';
  const syncVotes = K.debounce(async () => {
    if (!live() || !Board.has('vote')) return; const now = sig(); if (now === soc().votes) return;
    if (!soc().votes && now === EMPTY_SIG) return;   // 什麼都還沒選的新訪客，不必為了空白的一票去寫後端
    const picks = {}; SC.forEach(s => { picks[s.id] = Case.d.choices[s.id] || ''; });
    try { const out = await Api.vote({ picks, storm: Case.d.mine ? Case.d.mine.storm : -1 }); soc().votes = now; Case.save(); pulse = Object.assign({}, pulse || { totals: {}, feed: [] }, { poll: out.poll, storms: out.storms }); if (!pulseAt) pulseAt = Date.now(); if (pulse.totals) pulse.totals.voters = out.voters; A.emit('pulse', pulse); }
    catch (e) { /* 投票沒送出去不打擾人，下次再試 */ }
  }, 1500);
  A.on('choice', syncVotes); A.on('mine', syncVotes); A.on('import', syncVotes);
  A.on('board', () => { if (live()) { getPulse().then(() => syncVotes()); } });
  A.on('reveal', ({ s, pick, rv }) => {
    const p = pulse && pulse.poll && pulse.poll[s.id]; if (!p) return; const a = p.a | 0, b = p.b | 0, n = a + b; if (n < 1) return;
    const pa = Math.round(a / n * 100);
    rv.append(K.h('div.split-bar', K.h('span.lab', { text: '同好的選擇　共 ' + n + ' 位司辰' }), K.h('div.bar2', K.h('i', { style: 'width:' + pa + '%' }), K.h('i', { style: 'width:' + (100 - pa) + '%' })),
      K.h('div.nums', K.h('span' + (pick === 'a' ? '.on' : ''), { text: '甲　' + pa + '%' }), K.h('span' + (pick === 'b' ? '.on' : ''), { text: (100 - pa) + '%　乙' }))));
  });
  function censusInto(box, me, title) {
    const st = pulse && pulse.storms; box.textContent = ''; if (!st || !st.some(x => x > 0)) { box.hidden = true; return false; }
    const max = Math.max.apply(null, st), total = st.reduce((a, b) => a + b, 0), bars = K.h('div.census-bars', { role: 'img', 'aria-label': '十一場雨各有幾位司辰' });
    st.forEach((n, i) => { const d = K.h('div' + (i === me ? '.me' : ''), { title: ORD[i] + '暴雨：' + n + ' 位' }, n ? K.h('b', { text: String(n) }) : null, K.h('span', { text: String(i + 1) })); d.style.height = Math.max(2, Math.round(n / max * 100)) + '%'; bars.append(d); });
    box.hidden = false; box.append(K.h('span.lab', { text: title + '　共 ' + total + ' 位' }), bars, K.h('p.hint', { text: me >= 0 && st[me] > 0 ? '和你同一場雨的司辰有 ' + st[me] + ' 位（包含你）。' : '走過「你的暴雨」的司辰，各自落在哪一場雨。' }));
    return true;
  }
  A.on('mineCard', ({ r, card }) => { const box = K.h('div.census', { hidden: true }); card.append(box); const go = () => censusInto(box, r.storm, '同好的雨次'); if (pulse) go(); getPulse().then(go); });
  const chronCensus = () => { const box = $('storm-census'); if (box) censusInto(box, Case.d.mine ? Case.d.mine.storm : -1, '同好的雨次'); };
  A.on('chronicle', () => { chronCensus(); getPulse().then(chronCensus); });
  A.on('pulse', () => { if (A.cur === 'choices') A.scPaint(); if (A.cur === 'chronicle') chronCensus(); if (A.cur === 'hall') hallPaint(); });

  /* ---- 大廳：館內動態 ---- */
  function hallPaint() {
    const sec = $('pulse'); if (!sec) return; if (!pulse || !live()) { sec.hidden = true; return; }
    const t = pulse.totals || {}, feed = Array.isArray(pulse.feed) ? pulse.feed : [];
    if (!feed.length && !(t.relay || t.works || t.theories || t.voters)) { sec.hidden = true; return; }
    sec.hidden = false; const dl = $('pulse-n'); dl.textContent = '';
    [['接龍的段落', t.relay], ['展出的作品', t.works], ['公開的推測', t.theories], ['投過票的司辰', t.voters]].forEach(x => dl.append(K.h('div', K.h('dt', { text: x[0] }), K.h('dd', { text: String(x[1] | 0) }))));
    const ol = $('pulse-feed'); ol.textContent = '';
    feed.slice(0, 8).forEach(f => {
      const R = RELAYS.find(r => r.k === f.k), what = R ? '在接龍〈' + R.t + '〉接了一段' : f.k === 'gallery' ? '在展牆展出' : '公開了一則推測', href = R ? '#relay/' + f.k : f.k === 'gallery' ? '#studio/wall' : '#questions';
      ol.append(K.h('li', K.h('a', { href }, K.h('span.w', K.h('b', { text: String(f.name || '無名的司辰').slice(0, 16) }), what), K.h('span.a', { text: K.ago(+f.t || 0) }), K.h('span.s', { text: String(f.s || '').slice(0, 60) }))));
    });
    if (!feed.length) ol.append(K.h('li.empty', { text: '還沒有人留下東西。第一段可以是你的。' }));
    $('pulse-lab').textContent = '每分鐘更新';
  }
  A.on('hall', () => { hallPaint(); getPulse().then(hallPaint); });

  A.Social = { live, getPulse, censusInto, get pulse() { return pulse; } };
})();
