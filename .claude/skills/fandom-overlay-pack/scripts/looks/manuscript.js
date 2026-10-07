// Look plugin: "manuscript" — torn parchment, ink borders, ribbons, wax seals, burnt edges.
// For medieval/fantasy worlds: Middle-earth, The Witcher, Harry Potter, Westeros, Norse sagas.
// Colours: paper = parchment, ink = ink/text on parchment, metal = gilt accents, muted = parchment edge.
// Text on parchment uses ink colour (guides carry ink:true).
module.exports = function manuscript(E) {
  const { W, H, BAR, C, theme } = E; const h = E.h; const { id, f1, rng, mirror, esc, lin, diamond, dot, txt, G } = h;
  const { fDisplay, fNum, fHandle, wDisplay, wNum, wHandle } = h.fonts;
  const PARCH = theme.colors && theme.colors.parchment || C.paper, EDGE = theme.colors && theme.colors.parchmentEdge || '#9C7A45', INK = C.ink, BURN = '#3A2414';

  // ---------- primitives ----------
  // torn edge from (x1,y1) to (x2,y2), jagged + low-frequency wobble
  function tornEdge(x1, y1, x2, y2, seed, amp = 9, step = 14) {
    const r = rng(seed), len = Math.hypot(x2 - x1, y2 - y1), nx = -(y2 - y1) / len, ny = (x2 - x1) / len; let d = '';
    for (let t = 0; t <= len; t += step) { const k = t / len, j = (r() - .5) * amp * 2 + Math.sin(t / 90 + seed) * amp * .6; d += `L${f1(x1 + (x2 - x1) * k + nx * j)} ${f1(y1 + (y2 - y1) * k + ny * j)}`; }
    return d + `L${f1(x2)} ${f1(y2)}`;
  }
  // parchment shape: d = closed path; adds paper fibre noise, darker edge and burnt rim
  function parchment(d, seed = 1, shadow = true) {
    const g = id('pg'), n = id('pn'), c = id('pc'), b = id('pb');
    return `<defs><radialGradient id="${g}" cx="50%" cy="50%" r="75%"><stop offset=".5" stop-color="${PARCH}"/><stop offset="1" stop-color="${EDGE}"/></radialGradient>
      <filter id="${n}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="4" seed="${seed}"/><feColorMatrix values="0 0 0 0 .35  0 0 0 0 .22  0 0 0 0 .1  0 0 0 .55 -.05"/></filter>
      <filter id="${b}"><feGaussianBlur stdDeviation="2.5"/></filter><clipPath id="${c}"><path d="${d}"/></clipPath></defs>
      ${shadow ? `<path d="${d}" fill="#000" opacity=".45" transform="translate(6,8)" filter="url(#${b})"/>` : ''}
      <path d="${d}" fill="url(#${g})"/><g clip-path="url(#${c})"><rect x="-10" y="-10" width="${W + 20}" height="${H + 20}" filter="url(#${n})" opacity=".55"/></g>
      <path d="${d}" fill="none" stroke="${BURN}" stroke-width="5" opacity=".55" filter="url(#${b})"/><path d="${d}" fill="none" stroke="${BURN}" stroke-width="1.4" opacity=".8"/>`;
  }
  // hand-inked line (slightly wobbly double stroke)
  function inkLine(x1, y1, x2, y2, seed = 3, col = INK, w = 2.2) { const r = rng(seed); let d = `M${x1} ${y1}`; const n = 12; for (let i = 1; i <= n; i++) d += `L${f1(x1 + (x2 - x1) * i / n + (r() - .5) * 1.6)} ${f1(y1 + (y2 - y1) * i / n + (r() - .5) * 1.6)}`; return `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" opacity=".9"/>`; }
  const inkRect = (x, y, w, hh, seed = 5, col = INK) => inkLine(x, y, x + w, y, seed, col) + inkLine(x + w, y, x + w, y + hh, seed + 1, col) + inkLine(x + w, y + hh, x, y + hh, seed + 2, col) + inkLine(x, y + hh, x, y, seed + 3, col) + inkLine(x + 8, y + 8, x + w - 8, y + 8, seed + 4, col, 1) + inkLine(x + w - 8, y + 8, x + w - 8, y + hh - 8, seed + 5, col, 1) + inkLine(x + w - 8, y + hh - 8, x + 8, y + hh - 8, seed + 6, col, 1) + inkLine(x + 8, y + hh - 8, x + 8, y + 8, seed + 7, col, 1);
  // flourish divider: curls either side of a diamond
  function flourish(cx, y, w, col = INK) {
    const a = w / 2; const curl = (s) => `M${cx + s * 18} ${y}C${cx + s * a * .35} ${y - 14} ${cx + s * a * .6} ${y + 14} ${cx + s * a * .85} ${y}C${cx + s * a * .93} ${y - 6} ${cx + s * a} ${y - 2} ${cx + s * a * .97} ${y + 6}`;
    return `<path d="${curl(1)}${curl(-1)}" fill="none" stroke="${col}" stroke-width="2.2" stroke-linecap="round"/>` + diamond(cx, y, 11, col) + dot(cx - a * .97, y + 7, 2.5, col) + dot(cx + a * .97, y + 7, 2.5, col);
  }
  function ribbon(x, y, w, hh, col, tails = true) {
    const t = hh * .9, f = hh * .35; let s = '';
    if (tails) s += `<path d="M${x + 30} ${y + hh * .3}H${x - t}L${x - t + f} ${y + hh * .8}L${x - t} ${y + hh * 1.3}H${x + 30}Z" fill="${col}"/><path d="M${x + w - 30} ${y + hh * .3}H${x + w + t}L${x + w + t - f} ${y + hh * .8}L${x + w + t} ${y + hh * 1.3}H${x + w - 30}Z" fill="${col}"/>`;
    if (tails) s += `<path d="M${x + 30} ${y + hh * .3}H${x - t}L${x - t + f} ${y + hh * .8}L${x - t} ${y + hh * 1.3}H${x + 30}Z" fill="#000" opacity=".3"/><path d="M${x + w - 30} ${y + hh * .3}H${x + w + t}L${x + w + t - f} ${y + hh * .8}L${x + w + t} ${y + hh * 1.3}H${x + w - 30}Z" fill="#000" opacity=".3"/>`;
    s += `<path d="M${x} ${y}Q${x + w / 2} ${y - hh * .18} ${x + w} ${y}V${y + hh}Q${x + w / 2} ${y + hh * .82} ${x} ${y + hh}Z" fill="${col}"/><path d="M${x + 10} ${y + 8}Q${x + w / 2} ${y - hh * .18 + 8} ${x + w - 10} ${y + 8}" fill="none" stroke="${C.metal}" stroke-width="1.5" opacity=".8"/><path d="M${x + 10} ${y + hh - 8}Q${x + w / 2} ${y + hh * .82 - 8} ${x + w - 10} ${y + hh - 8}" fill="none" stroke="${C.metal}" stroke-width="1.5" opacity=".8"/>`;
    return s;
  }
  function compass(cx, cy, r, col = INK) {
    let s = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${col}" stroke-width="1.5"/><circle cx="${cx}" cy="${cy}" r="${r * .82}" fill="none" stroke="${col}" stroke-width=".8"/>`;
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 - Math.PI / 2, L = k % 2 ? r * .55 : r * .95, wv = r * .12, p = (ang, rr) => `${f1(cx + rr * Math.cos(ang))} ${f1(cy + rr * Math.sin(ang))}`; s += `<path d="M${p(a, L)}L${p(a + Math.PI / 2, wv)}L${cx} ${cy}Z" fill="${col}"/><path d="M${p(a, L)}L${p(a - Math.PI / 2, wv)}L${cx} ${cy}Z" fill="${col}" opacity=".45"/>`; }
    return s + `<text x="${cx}" y="${f1(cy - r - 8)}" text-anchor="middle" font-family="${fDisplay}" font-weight="${wDisplay}" font-size="${f1(r * .35)}" fill="${col}">N</text>`;
  }
  function splatter(cx, cy, seed, col = INK, n = 14, spread = 60) { const r = rng(seed); let s = ''; for (let i = 0; i < n; i++) { const a = r() * Math.PI * 2, d = Math.pow(r(), 1.6) * spread; s += dot(cx + d * Math.cos(a), cy + d * Math.sin(a), f1(.8 + r() * (i === 0 ? 9 : 3.5)), col, .75); } return s; }
  function burnt(B) { const g = id('bv'), n = id('bn'); return `<defs><radialGradient id="${g}" cx="50%" cy="50%" r="72%"><stop offset=".58" stop-color="${BURN}" stop-opacity="0"/><stop offset=".86" stop-color="${BURN}" stop-opacity=".75"/><stop offset="1" stop-color="#140904" stop-opacity=".98"/></radialGradient><filter id="${n}"><feTurbulence type="fractalNoise" baseFrequency=".02" numOctaves="3" seed="9"/><feColorMatrix values="0 0 0 0 .08  0 0 0 0 .04  0 0 0 0 .02  0 0 0 .9 -.35"/></filter></defs><rect width="${W}" height="${B}" fill="url(#${g})"/><rect width="${W}" height="${B}" filter="url(#${n})" opacity=".6"/>`; }
  const strip = (y0, y1, edge, seed) => edge === 'bottom'
    ? `M0 ${y0}H${W}V${y1}` + tornEdge(W, y1, 0, y1, seed) + 'Z'
    : `M0 ${y0}` + tornEdge(0, y0, W, y0, seed) + `V${y1}H0Z`;

  // ---------- layouts ----------
  E.layouts = function (bar, acc) {
    const B = bar ? H - BAR : H; const L = {};
    L.A_scroll = { pieces: {
        top_parchment: parchment(strip(0, 250, 'bottom', 11), 3), bottom_parchment: parchment(strip(B - 230, B, 'top', 12), 4),
        flourishes: flourish(W / 2, 228, 420, INK) + flourish(W / 2, B - 196, 300, INK),
        ink_splatter: splatter(170, 120, 4) + splatter(W - 220, B - 80, 5, INK, 10, 40) },
      accentPieces: [],
      guides: [G('en1', 'ENGLISH 1 (ink)', 560, 40, 800, 40, { ink: true }), G('en2', 'ENGLISH 2 (ink)', 260, 84, 1400, 110, { ink: true }), G('face', 'IMAGE / FACE ZONE', 160, 280, W - 320, B - 540), G('bn', 'BANGLA (ink)', 260, B - 176, 1400, 110, { ink: true }), G('tag', 'TAG · wax seal', W - 300, B - 300, 200, 200, { tag: 'seal' })] };
    const card = `M66 70` + tornEdge(66, 70, 1060, 56, 21, 6) + tornEdge(1060, 56, 1074, 330, 22, 6) + tornEdge(1074, 330, 72, 344, 23, 6) + tornEdge(72, 344, 66, 70, 24, 6) + 'Z';
    const note = `M70 ${B - 190}` + tornEdge(70, B - 190, 1300, B - 196, 31, 6) + tornEdge(1300, B - 196, 1306, B - 40, 32, 6) + tornEdge(1306, B - 40, 76, B - 34, 33, 6) + tornEdge(76, B - 34, 70, B - 190, 34, 6) + 'Z';
    L.B_journal_left = { pieces: {
        title_card: parchment(card, 5), title_rule: `<rect x="100" y="262" width="150" height="6" fill="${acc}"/>` + inkLine(256, 265, 980, 265, 8, INK, 1.6),
        tape: [[110, 52], [1000, 40]].map(([x, y], i) => `<rect x="${x}" y="${y}" width="110" height="34" fill="${PARCH}" opacity=".7" transform="rotate(${i ? 8 : -9} ${x + 55} ${y + 17})"/>`).join(''),
        bangla_note: parchment(note, 6), ink_splatter: splatter(1180, 300, 7, INK, 12, 50) },
      accentPieces: ['title_rule'],
      guides: [G('en1', 'ENGLISH 1 (ink)', 104, 96, 900, 40, { align: 'start', ink: true }), G('en2', 'ENGLISH 2 (ink)', 100, 138, 930, 110, { align: 'start', ink: true }), G('tag', 'TAG · wax seal', 1620, 60, 240, 240, { tag: 'seal', shape: 'circle' }), G('face', 'FACE / CHARACTER ZONE', 1120, 360, 720, B - 600), G('bn', 'BANGLA (ink)', 104, B - 164, 1170, 104, { align: 'start', ink: true })] };
    L.C_ribbon = { pieces: {
        burnt_edges: burnt(B), title_ribbon: ribbon(460, 70, 1000, 120, acc),
        bottom_parchment: parchment(strip(B - 200, B, 'top', 41), 8), flourish: flourish(W / 2, B - 168, 280, INK) },
      accentPieces: ['title_ribbon'],
      guides: [G('en1', 'ENGLISH 1 (above ribbon)', 560, 18, 800, 40), G('en2', 'ENGLISH 2 (on ribbon)', 520, 86, 880, 90), G('face', 'IMAGE / FACE ZONE', 200, 240, W - 400, B - 480), G('tag', 'TAG · parchment label', W - 320, B - 300, 240, 90, { tag: 'label' }), G('bn', 'BANGLA (ink)', 260, B - 148, 1400, 104, { ink: true })] };
    const win = bar ? { x: 432, y: 186, w: 1056, h: 594 } : { x: 400, y: 190, w: 1120, h: 630 };
    const holeD = `M0 0H${W}V${B}H0Z M${win.x} ${win.y}V${win.y + win.h}H${win.x + win.w}V${win.y}Z`;
    L.D_map_frame = { pieces: (() => { const pc = id('mc'); let grid = ''; for (let x = 0; x < W; x += 80) grid += lin(x, 0, x, B, INK, .6, .18); for (let y = 0; y < B; y += 80) grid += lin(0, y, W, y, INK, .6, .18); return {
        map_parchment: `<defs><clipPath id="${pc}"><path clip-rule="evenodd" d="${holeD}"/></clipPath></defs><g clip-path="url(#${pc})">${parchment(`M0 0H${W}V${B}H0Z`, 9, false)}${grid}</g>`,
        window_border: inkRect(win.x - 18, win.y - 18, win.w + 36, win.h + 36, 51) + `<rect x="${win.x - 4}" y="${win.y - 4}" width="${win.w + 8}" height="${win.h + 8}" fill="none" stroke="${INK}" stroke-width="4"/>`,
        compass: compass(win.x / 2, win.y + 150, 90), side_flourishes: flourish(W - win.x / 2, win.y + win.h / 2, 260, INK).replace(/<path/, `<g transform="rotate(90 ${W - win.x / 2} ${win.y + win.h / 2})"><path`).replace(/$/, '</g>') }; })(),
      accentPieces: [],
      guides: [G('en1', 'ENGLISH 1 (ink)', 560, 30, 800, 34, { ink: true }), G('en2', 'ENGLISH 2 (ink)', 330, 66, 1260, win.y - 110, { ink: true }), G('face', `IMAGE ${win.w}×${win.h} at x${win.x} y${win.y}`, win.x, win.y, win.w, win.h), G('tag', 'TAG · wax seal', win.x / 2 - 100, win.y + win.h - 230, 200, 200, { tag: 'seal' }), G('bn', 'BANGLA (ink)', 330, win.y + win.h + 52, 1260, B - win.y - win.h - 70, { ink: true })] };
    L.E_burnt_edges = { pieces: { burnt_edges: burnt(B), scrim_top: h.scrimTop(300, .6), scrim_bottom: h.scrimBottom(B, 360, .8), gilt_frame: `<rect x="34" y="34" width="${W - 68}" height="${B - 68}" fill="none" stroke="${C.metal}" stroke-width="1.6" opacity=".85"/>` + [[34, 34], [W - 34, 34], [W - 34, B - 34], [34, B - 34]].map(([x, y]) => diamond(x, y, 14, C.metal)).join(''), flourish: flourish(W / 2, 236, 380, C.metal) },
      accentPieces: [],
      guides: [G('en1', 'ENGLISH 1', 560, 70, 800, 36), G('en2', 'ENGLISH 2', 260, 110, 1400, 100), G('tag', 'TAG · wax seal', W - 280, 60, 200, 200, { tag: 'seal' }), G('face', 'FACE ZONE', 460, 270, 1000, B - 500), G('bn', 'BANGLA', 260, B - 160, 1400, 100)] };
    const side = `M0 0H760` + tornEdge(760, 0, 700, B, 61, 12) + `H0Z`;
    L.F_torn_side_left = { pieces: {
        torn_panel: parchment(side, 10), panel_rule: `<rect x="96" y="338" width="120" height="6" fill="${acc}"/>` + inkLine(222, 341, 640, 341, 12, INK, 1.6),
        flourish: flourish(360, B - 330, 380, INK), ink_splatter: splatter(600, 120, 13, INK, 10, 40) },
      accentPieces: ['panel_rule'],
      guides: [G('en1', 'ENGLISH 1 (ink)', 90, 100, 600, 36, { align: 'start', ink: true }), G('en2', 'ENGLISH 2 (ink)', 90, 142, 600, 176, { align: 'start', ink: true }), G('tag', 'TAG · ribbon', 90, 376, 300, 110, { tag: 'ribbon' }), G('bn', 'BANGLA (ink, 2–3 lines)', 90, B - 290, 580, 210, { align: 'start', ink: true }), G('face', 'CHARACTER SIDE', 820, 70, 1040, B - 140)] };
    for (const k of Object.keys(L)) if (/_left$/.test(k)) {
      const src = L[k];
      L[k.replace(/_left$/, '_right')] = { barStyle: src.barStyle, accentPieces: src.accentPieces, pieces: Object.fromEntries(Object.entries(src.pieces).map(([n, v]) => [n, mirror(v)])),
        guides: src.guides.map((g) => Object.assign({}, g, { x: W - g.x - g.w, align: g.align === 'start' ? 'end' : g.align === 'end' ? 'start' : g.align })) };
    }
    return L;
  };

  // ---------- tags ----------
  E.TAGS.ribbon = { box: [300, 110], fam: 'manuscript', fn(s, n) {
    return ribbon(58, 22, 184, 62, s.accent) + `<text x="150" y="66" text-anchor="middle" font-family="${fDisplay}" font-weight="${wDisplay}" font-size="30" letter-spacing="3" fill="${C.paper}" data-maxw="164">${esc(s.code)}<tspan font-family="${fNum}" font-weight="${wNum}" style="font-variant-numeric:lining-nums" letter-spacing="1"> ${n}</tspan></text>`; } };
  E.TAGS.label = { box: [240, 90], fam: 'manuscript', fn(s, n) {
    const d = `M10 14` + tornEdge(10, 14, 230, 8, n + 1, 3, 10) + tornEdge(230, 8, 228, 80, n + 2, 3, 10) + tornEdge(228, 80, 12, 84, n + 3, 3, 10) + tornEdge(12, 84, 10, 14, n + 4, 3, 10) + 'Z';
    return `<g>${parchment(d, n % 7 + 1)}</g>` + `<text x="120" y="58" text-anchor="middle" font-family="${fDisplay}" font-weight="${wDisplay}" font-size="30" letter-spacing="3" fill="${INK}" data-maxw="190">${esc(s.code)}<tspan fill="${s.accent}" font-family="${fNum}" font-weight="${wNum}" style="font-variant-numeric:lining-nums" letter-spacing="1"> ${n}</tspan></text>`; } };
  E.tagStyles = ['seal', 'ribbon', 'label', 'stamp'];
  Object.assign(E.TAG_FOLDERS, { ribbon: 'Ribbon', label: 'Parchment_label' });

  // ---------- follow bar ----------
  const baseBar = E.followBar;
  E.followBar = function (bg, iconStyle = 'theme', y = H - BAR) {
    if (bg !== 'feature') return baseBar(bg, iconStyle, y);
    const cy = y + BAR / 2; let s = parchment(`M0 ${y + 8}` + tornEdge(0, y + 8, W, y + 8, 77, 5, 12) + `V${H}H0Z`, 2, false);
    s += txt(72, cy + 12, esc(theme.followText || 'FOLLOW'), { size: 22, fill: INK, anchor: 'start', ls: 7, shadowEpic: false, maxw: 130 });
    s += E.icons(iconStyle === 'brand' ? null : INK, 220, cy - 15, 36, 16);
    s += flourish(560, cy + 2, 240, INK);
    s += txt(W - 72, cy + 13, h.handleMarkup(theme.colors && theme.colors.accentInk || '#7A1E1E'), { size: 32, font: fHandle, weight: wHandle, fill: INK, anchor: 'end', ls: .5, shadowEpic: false, maxw: 760 });
    return s;
  };

  // ---------- lines + extras ----------
  const baseLines = E.lines;
  E.lines = (accents) => {
    const Lz = baseLines(accents);
    for (const [nm, col] of accents) Lz[`ribbon_blank_${nm}`] = [700, 150, () => ribbon(110, 30, 480, 90, col)];
    Object.assign(Lz, {
      flourish_ink: [460, 40, () => flourish(230, 20, 440, INK)], flourish_gilt: [460, 40, () => flourish(230, 20, 440, C.metal)],
      ink_rule: [1800, 10, () => inkLine(4, 5, 1796, 5, 3)], ink_frame_box: [800, 300, () => inkRect(6, 6, 788, 288, 9)],
      compass_rose: [260, 280, () => compass(130, 150, 110)], ink_splatter: [200, 200, () => splatter(100, 100, 3, INK, 18, 80)],
      parchment_note_blank: [700, 220, () => parchment(`M14 20` + tornEdge(14, 20, 686, 12, 1, 6) + tornEdge(686, 12, 690, 200, 2, 6) + tornEdge(690, 200, 10, 208, 3, 6) + tornEdge(10, 208, 14, 20, 4, 6) + 'Z', 5)],
    });
    return Lz;
  };
  const baseExtras = E.extras;
  E.extras = (accents) => Object.assign(baseExtras(accents), {
    burnt_edges: burnt(H), parchment_top_strip: parchment(strip(0, 250, 'bottom', 11), 3), parchment_bottom_strip: parchment(strip(H - 250, H, 'top', 12), 4),
    parchment_side_left: parchment(`M0 0H760` + tornEdge(760, 0, 700, H, 61, 12) + `H0Z`, 10), parchment_side_right: mirror(parchment(`M0 0H760` + tornEdge(760, 0, 700, H, 61, 12) + `H0Z`, 10)),
    ink_frame: inkRect(30, 30, W - 60, H - 60, 21),
  });
  E.lookName = 'manuscript';
  return E;
};
