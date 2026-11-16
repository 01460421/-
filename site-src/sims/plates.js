(window.SIMS = window.SIMS || {}).plates = function (el, opt) {
  const uid = 'p' + Math.random().toString(36).slice(2, 8);
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MODES = {
    ridge: { b: '張裂', t: '張裂型邊界：中洋脊', f: [['相對運動', '互相遠離（張力）'], ['岩石圈', '生成（新海洋地殼）'], ['地形', '中洋脊、裂谷'], ['地震', '淺源'], ['火山', '有：減壓熔融，玄武岩質'], ['實例', '大西洋中洋脊、冰島、東太平洋洋隆；陸上：東非裂谷、紅海']],
      n: '地函物質上升、減壓熔融產生玄武岩質岩漿，在洋脊生成新的海洋地殼，再向兩側推開：離洋脊愈遠，岩石愈老、岩石圈愈厚。' },
    oc: { b: '聚合：洋–陸', t: '聚合型：海洋板塊隱沒到大陸板塊下', f: [['相對運動', '互相靠近（擠壓）'], ['岩石圈', '消滅（海洋板塊隱沒）'], ['地形', '海溝、陸緣山脈'], ['地震', '淺、中、深源皆有，向上覆板塊一側變深'], ['火山', '陸緣火山弧，多安山岩質'], ['實例', '安地斯山脈、北美西北部']],
      n: '密度大的海洋岩石圈隱沒；隱沒板塊約 100 km 深處釋出水分，使上方地函楔熔點降低而部分熔融，所以火山弧在上覆板塊上、與海溝平行。', tw: '臺灣周邊沒有典型的洋–陸隱沒：東北外海與南部外海是兩個方向相反的洋–洋隱沒帶，中間的臺灣本島是弧陸碰撞帶（見另兩個選項）。' },
    oo: { b: '聚合：洋–洋', t: '聚合型：海洋板塊隱沒到海洋板塊下', f: [['相對運動', '互相靠近（擠壓）'], ['岩石圈', '消滅（較老、較冷者隱沒）'], ['地形', '海溝、島弧、弧後盆地'], ['地震', '淺、中、深源皆有'], ['火山', '島弧火山'], ['實例', '馬里亞納、日本、琉球、呂宋島弧']],
      n: '兩個海洋板塊相遇時，較老、較冷（密度較大）者隱沒。由海向陸依序為：海溝 → 島弧 → 弧後盆地；震源沿隱沒板塊由淺而深。', tw: '東北外海：菲律賓海板塊沿琉球海溝向北隱沒到歐亞板塊下（琉球島弧、沖繩海槽、龜山島）；南部外海：南海（歐亞板塊）沿馬尼拉海溝向東隱沒到菲律賓海板塊下（呂宋島弧：綠島、蘭嶼）。' },
    cc: { b: '聚合：陸–陸', t: '聚合型：大陸與大陸碰撞', f: [['相對運動', '互相靠近（擠壓）'], ['岩石圈', '增厚（都不易隱沒）'], ['地形', '褶皺山脈、高原，地殼厚可達 60–70 km'], ['地震', '以淺源為主，分布範圍寬'], ['火山', '無大型火山弧'], ['實例', '喜馬拉雅山、阿爾卑斯山']],
      n: '大陸岩石圈密度小、浮力大，原先的洋底隱沒殆盡後兩陸相撞，地殼擠壓增厚形成高山與山根；沒有沿傾斜帶延伸到數百公里深的地震。', tw: '臺灣本島是呂宋島弧與歐亞大陸邊緣的「弧陸碰撞」（蓬萊造山運動）：海岸山脈是已上陸的島弧，花東縱谷為縫合帶，西部麓山帶褶皺與逆斷層發達。菲律賓海板塊每年約 7–8 cm 向西北擠壓。' },
    tf: { b: '錯動', t: '錯動型邊界：轉形斷層（俯視）', f: [['相對運動', '沿邊界水平錯開（剪力）'], ['岩石圈', '不生成也不消滅'], ['地形', '轉形斷層、線狀谷地'], ['地震', '淺源'], ['火山', '一般無'], ['實例', '中洋脊間的轉形斷層、聖安地列斯斷層']],
      n: '只有兩段洋脊之間的斷層段兩側反向運動，是板塊邊界（地震集中）；洋脊外側的斷裂帶兩側同向移動，不是邊界。' },
  };
  const keys = Object.keys(MODES);
  const st = { mode: keys.includes(opt && opt.mode) ? opt.mode : 'ridge', ph: 0, play: !reduce };
  el.innerHTML = `<div class="sim-head"><b>三類板塊邊界</b><span>選擇邊界類型，看板塊怎麼動、形成哪些地形，以及地震與火山出現在哪裡。</span></div>
  <div class="sim-body"><div class="sim-viz"><svg viewBox="0 0 420 252" role="img" aria-label="板塊邊界剖面"></svg></div>
  <div class="sim-ctl">
    <div class="ops" data-g="m">${keys.map((k) => `<button type="button" data-v="${k}">${MODES[k].b}</button>`).join('')}</div>
    <div class="ops"><button type="button" data-p></button></div>
    <div class="facts"></div>
    <p class="sim-note"></p>
    <p data-tw style="margin:0;font-size:.86rem;color:var(--ink-2);border-left:3px solid var(--c-E);padding:2px 0 2px 10px"></p>
  </div></div>`;
  const svg = el.querySelector('svg'), facts = el.querySelector('.facts'), note = el.querySelector('.sim-note'), tw = el.querySelector('[data-tw]'), pb = el.querySelector('[data-p]');
  const SEA = 60, Y = (km) => 80 + km * 0.42, P = (a) => a.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L');
  const txt = (x, y, s, o = '') => `<text x="${x}" y="${y}" font-size="14" fill="var(--ink)" stroke="var(--card)" stroke-width="3" paint-order="stroke" ${o}>${s}</text>`;
  const arrow = (x1, y1, x2, y2, c = 'var(--ink)') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="3" marker-end="url(#${uid}${c === 'var(--ink)' ? 'a' : 'c'})"/>`;
  const XT = 170, Y0 = 80, TH = 30;
  const slab = (() => { const a = []; let x = XT, y = Y0; for (let s = -(XT - 30); s < 400; s += 2) { const g = s <= 0 ? 0 : 50 * Math.PI / 180 * Math.min(1, s / 80); if (s <= 0) x = XT + s; else { x += 2 * Math.cos(g); y += 2 * Math.sin(g); } a.push([x, y, g]); if (y > 252) break; } return a; })();
  const bot = (p) => [p[0] - TH * Math.sin(p[2]), p[1] + TH * Math.cos(p[2])];
  const iV = slab.findIndex((p) => p[1] >= Y(100)), XV = slab[iV][0];
  const QS = [8, 22, 40, 60, 80, 100, 125, 150, 180, 210, 240, 268].map((k) => (k + XT - 30) / 2);
  let stat = '', top = '';
  function build() {
    const m = st.mode;
    stat = `<defs>${[['a', 'var(--ink)'], ['c', 'var(--c-C)']].map(([k, c]) => `<marker id="${uid}${k}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L10 5L0 10z" fill="${c}"/></marker>`).join('')}</defs>`;
    top = '';
    if (m === 'tf') {
      stat += `<rect x="30" y="8" width="390" height="236" fill="var(--c-P)" fill-opacity=".18"/>`;
      stat += `<line x1="30" y1="126" x2="150" y2="126" stroke="var(--mute)" stroke-width="2" stroke-dasharray="6 5"/><line x1="300" y1="126" x2="420" y2="126" stroke="var(--mute)" stroke-width="2" stroke-dasharray="6 5"/>`;
      stat += `<line x1="150" y1="126" x2="300" y2="126" stroke="var(--ink)" stroke-width="3.5"/>`;
      top += `<line x1="150" y1="8" x2="150" y2="126" stroke="var(--red)" stroke-width="5"/><line x1="300" y1="126" x2="300" y2="244" stroke="var(--red)" stroke-width="5"/>`;
      top += arrow(110, 40, 70, 40) + arrow(190, 40, 230, 40) + arrow(260, 212, 220, 212) + arrow(340, 212, 380, 212);
      top += arrow(180, 108, 230, 108, 'var(--c-C)') + arrow(270, 144, 220, 144, 'var(--c-C)');
      top += txt(156, 22, '洋脊') + txt(306, 238, '洋脊') + txt(170, 96, '轉形斷層（板塊邊界）') + txt(36, 118, '斷裂帶（非邊界）', 'font-size="12"') + txt(312, 118, '斷裂帶（非邊界）', 'font-size="12"');
      top += txt(306, 160, '兩側同向') + txt(40, 160, '兩側同向');
      return;
    }
    stat += `<rect x="30" y="${SEA}" width="390" height="192" fill="var(--c-C)" fill-opacity=".14"/>`;
    for (let k = 0; k <= 400; k += 100) stat += `<line x1="24" y1="${Y(k)}" x2="30" y2="${Y(k)}" stroke="var(--ink-2)"/><text x="22" y="${Y(k) + 4}" font-size="11" text-anchor="end" fill="var(--ink-2)">${k}</text>`;
    stat += `<line x1="30" y1="${Y(0)}" x2="30" y2="252" stroke="var(--ink-2)"/><text x="2" y="${SEA - 8}" font-size="10" fill="var(--ink-2)">深度 km</text>`;
    stat += `<rect x="30" y="${SEA}" width="390" height="50" fill="var(--c-P)" fill-opacity=".22"/><line x1="30" y1="${SEA}" x2="420" y2="${SEA}" stroke="var(--c-P)"/>`;
    top += txt(36, 240, '軟流圈', 'fill="var(--c-C)"');
    if (m === 'ridge') {
      const t = (x) => 82 - 12 * Math.exp(-(((x - 225) / 45) ** 2)), th = (x) => 6 + 26 * Math.min(1, Math.abs(x - 225) / 160);
      stat += `<path d="M205 252 L215 ${Y(30)} L222 72 L228 72 L235 ${Y(30)} L245 252Z" fill="var(--red)" fill-opacity=".35"/>`;
      [[30, 221], [229, 420]].forEach(([a, b]) => { const tp = [], bt = []; for (let x = a; x <= b; x += 4) { tp.push([x, t(x)]); bt.push([x, t(x) + th(x)]); } stat += `<path d="M${P(tp)}L${P(bt.reverse())}Z" fill="var(--c-P)" fill-opacity=".7"/>`; });
      top += arrow(120, 52, 70, 52) + arrow(330, 52, 380, 52) + txt(203, 40, '中洋脊（裂谷）') + txt(250, 160, '岩漿上升（減壓熔融）', 'fill="var(--red)"') + txt(60, 104, '海洋岩石圈');
    } else if (m === 'oc' || m === 'oo') {
      const tip = slab.findIndex((p) => p[0] >= XT + 14), yb = 118, ib = slab.findIndex((p) => p[1] >= yb);
      const wedge = slab.slice(tip, ib + 1).map((p) => [p[0], p[1]]);
      let surf = m === 'oc' ? [[420, 52], [XT + 62, 52], [XT + 30, 66]] : [[420, 78], [XV + 100, 78], [XV + 80, 86], [XV + 50, 86], [XV + 30, 78], [XT + 40, 76]];
      stat += `<path d="M${P(slab.map((p) => [p[0], p[1]]))}L${P(slab.map(bot).reverse())}Z" fill="var(--c-P)" fill-opacity=".75"/>`;
      stat += `<path d="M${P(wedge)}L${P([[420, yb]].concat(surf))}Z" fill="${m === 'oc' ? 'var(--c-E)' : 'var(--c-P)'}" fill-opacity="${m === 'oc' ? '.6' : '.45'}"/>`;
      stat += `<ellipse cx="${XV + 2}" cy="${Y(100) - 4}" rx="12" ry="7" fill="var(--red)" fill-opacity=".55"/><line x1="${XV}" y1="${Y(100) - 6}" x2="${XV}" y2="${m === 'oc' ? 30 : 44}" stroke="var(--red)" stroke-width="3" stroke-opacity=".6"/>`;
      stat += `<path d="M${XV - 24} ${m === 'oc' ? 53 : 80} L${XV - 4} ${m === 'oc' ? 26 : 40} L${XV + 4} ${m === 'oc' ? 26 : 40} L${XV + 24} ${m === 'oc' ? 53 : 80}Z" fill="var(--c-E)" fill-opacity=".9"/>`;
      top += arrow(60, 72, 110, 72) + `<line x1="${XT + 4}" y1="44" x2="${XT + 4}" y2="80" stroke="var(--ink)"/>` + txt(XT - 12, 40, '海溝');
      top += txt(XV - 30, 18, m === 'oc' ? '陸緣火山弧' : '島弧') + txt(XV + 10, Y(100) + 26, '地函楔熔融', 'fill="var(--red)" font-size="12"');
      top += txt(36, 101, m === 'oc' ? '海洋板塊（隱沒）' : '較老的海洋板塊（隱沒）', 'font-size="12"') + (m === 'oc' ? txt(330, 90, '大陸板塊') : txt(XV + 40, 72, '弧後盆地', 'font-size="12"'));
    } else {
      const tp = [[30, 52], [150, 52], [190, 36], [215, 18], [235, 18], [262, 36], [300, 52], [420, 52]], bt = [[420, 118], [300, 118], [262, 148], [225, 168], [190, 148], [150, 118], [30, 118]];
      stat += `<path d="M${P(tp)}L${P(bt)}Z" fill="var(--c-E)" fill-opacity=".6"/>`;
      for (let k = 0; k < 3; k++) stat += `<path d="M160 ${70 + k * 10} Q180 ${52 + k * 10} 200 ${70 + k * 10} T240 ${70 + k * 10} T280 ${70 + k * 10}" fill="none" stroke="var(--c-E)" stroke-width="1.5"/>`;
      stat += `<line x1="225" y1="18" x2="225" y2="168" stroke="var(--ink)" stroke-dasharray="4 3"/>`;
      stat += `<path d="M218 178 L240 176 L268 244 L246 248Z" fill="var(--c-P)" fill-opacity=".5"/>`;
      top += arrow(60, 40, 110, 40) + arrow(390, 40, 340, 40) + txt(170, 12, '褶皺山脈') + txt(236, 164, '山根（地殼增厚）', 'font-size="12"') + txt(276, 236, '斷離的舊海洋板塊', 'font-size="12"') + txt(40, 108, '大陸岩石圈') + txt(330, 108, '大陸岩石圈');
    }
    top += `<g font-size="12">${[['var(--red)', '淺源 < 70 km'], ['var(--c-C)', '中源'], ['var(--c-X)', '深源 > 300 km']].map((q, i) => `<circle cx="40" cy="${150 + i * 15}" r="4" fill="${q[0]}"/><text x="48" y="${154 + i * 15}" fill="var(--ink-2)">${q[1]}</text>`).join('')}</g>`;
  }
  const qcol = (y) => { const d = (y - 80) / 0.42; return d < 70 ? 'var(--red)' : d < 300 ? 'var(--c-C)' : 'var(--c-X)'; };
  function dyn() {
    const m = st.mode, ph = st.ph;
    let s = '', q = [];
    if (m === 'ridge') {
      for (let k = 0; k < 12; k++) { const d = (ph + k * 16) % 192; s += `<line x1="${225 - d - 4}" y1="${74 + d * 0.05}" x2="${225 - d - 4}" y2="${84 + d * 0.15}" stroke="var(--card)" stroke-width="2" opacity=".7"/><line x1="${225 + d + 4}" y1="${74 + d * 0.05}" x2="${225 + d + 4}" y2="${84 + d * 0.15}" stroke="var(--card)" stroke-width="2" opacity=".7"/>`; }
      for (let k = 0; k < 4; k++) { const y = 252 - ((ph * 1.6 + k * 45) % 180); s += `<circle cx="${225 + Math.sin(k + y / 20) * 4}" cy="${y}" r="4" fill="var(--red)"/>`; }
      q = [[218, 76], [232, 79], [224, 84], [210, 80], [240, 82]];
    } else if (m === 'oc' || m === 'oo') {
      for (let k = 0; k * 20 < slab.length * 2; k++) { const i = Math.floor(((ph + k * 20) % (slab.length * 2)) / 2); if (i >= slab.length) continue; const a = slab[i], b = bot(a); s += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="var(--card)" stroke-width="2" opacity=".6"/>`; }
      for (let k = 0; k < 3; k++) { const y = Y(100) - 6 - ((ph * 1.2 + k * 25) % 75); if (y > (m === 'oc' ? 30 : 44)) s += `<circle cx="${XV}" cy="${y}" r="3.5" fill="var(--red)"/>`; }
      q = QS.map((i) => { const p = slab[Math.min(Math.round(i), slab.length - 1)]; return [p[0] - 5 * Math.sin(p[2]), p[1] + 5 * Math.cos(p[2])]; }).concat([[XT + 30, 70], [XT + 50, 82]]);
    } else if (m === 'cc') {
      for (let k = 0; k < 9; k++) { const d = (ph + k * 16) % 140; s += `<line x1="${30 + d}" y1="56" x2="${30 + d}" y2="114" stroke="var(--card)" stroke-width="2" opacity=".55"/><line x1="${420 - d}" y1="56" x2="${420 - d}" y2="114" stroke="var(--card)" stroke-width="2" opacity=".55"/>`; }
      q = [[160, 70], [185, 86], [200, 62], [215, 100], [240, 74], [255, 106], [275, 66], [300, 90], [140, 96], [320, 72]];
    } else {
      for (let k = 0; k < 10; k++) { const d = (ph * 0.8 + k * 15) % 150; [[150, 8, 126], [300, 126, 244]].forEach(([x, y1, y2]) => [x - d, x + d].forEach((xx) => { if (xx > 31 && xx < 419) s += `<line x1="${xx}" y1="${y1}" x2="${xx}" y2="${y2}" stroke="var(--c-P)" stroke-opacity=".3" stroke-width="2"/>`; })); }
      q = [[170, 126], [195, 124], [222, 128], [250, 125], [280, 127], [150, 60], [300, 190]];
    }
    q.forEach((p, i) => { const o = st.play ? 0.45 + 0.55 * Math.abs(Math.sin(ph / 9 + i * 1.7)) : 1; s += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4" fill="${m === 'tf' ? 'var(--red)' : qcol(p[1])}" stroke="var(--card)" opacity="${o.toFixed(2)}"/>`; });
    svg.innerHTML = stat + s + top + `<text x="416" y="248" text-anchor="end" font-size="10" fill="var(--mute)">示意圖，未依比例</text>`;
  }
  function sync() {
    build(); const M = MODES[st.mode];
    el.querySelectorAll('[data-g=m] button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === st.mode));
    facts.innerHTML = `<div class="fact" style="grid-column:1/-1"><span>邊界類型</span><b>${M.t}</b></div>` + [0, 1, 2, 4, 3, 5].map((i) => `<div class="fact"${i === 5 || i === 3 ? ' style="grid-column:1/-1"' : ''}><span>${M.f[i][0]}</span><b>${M.f[i][1]}</b></div>`).join('');
    note.textContent = M.n; tw.style.display = M.tw ? '' : 'none'; tw.innerHTML = M.tw ? '<b>臺灣：</b>' + M.tw : '';
    pb.textContent = st.play ? '❚❚ 暫停' : '▶ 播放'; pb.setAttribute('aria-pressed', st.play);
    dyn();
  }
  let run = 0;
  function start() {
    const id = ++run; let last = 0;
    const tick = (ts) => {
      if (!el.isConnected || !st.play || id !== run) return;
      if (last) st.ph += Math.min(ts - last, 100) * 0.012;
      last = ts; dyn(); requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.v) st.mode = b.dataset.v;
    if (b.hasAttribute('data-p')) { st.play = !st.play; if (st.play) start(); }
    sync();
  });
  sync();
  if (st.play) start();
};
