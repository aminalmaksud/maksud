// Look plugin: "scifi" — HUD / starship-console style for space opera, cyberpunk, Dune, games.
// Chamfered panels, glow lines, scanlines, hex grids, rulers, segmented bars, reticles.
// Colours: metal = glow line colour, hi = secondary glow, ink = panel, paper = text.
module.exports = function scifi(E) {
  const { W, H, BAR, C, theme } = E; const h = E.h; const { id, f1, rng, mirror, esc, lin, txt, G, clipTo } = h;
  const { fDisplay, fNum, fHandle, wDisplay, wNum, wHandle } = h.fonts;
  const glow = C.metal, glow2 = C.hi;

  // ---------- primitives ----------
  const chamfer = (x, y, w, hh, c = 24) => `M${f1(x + c)} ${f1(y)}H${f1(x + w - c)}L${f1(x + w)} ${f1(y + c)}V${f1(y + hh - c)}L${f1(x + w - c)} ${f1(y + hh)}H${f1(x + c)}L${f1(x)} ${f1(y + hh - c)}V${f1(y + c)}Z`;
  const glowF = () => { const g = id('gl'); return [g, `<filter id="${g}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`]; };
  function panel(x, y, w, hh, c = 24, op = .8, col = glow) {
    const [g, gf] = glowF(); const d = chamfer(x, y, w, hh, c);
    return `<defs>${gf}</defs><path d="${d}" fill="${C.ink}" opacity="${op}"/><path d="${d}" fill="none" stroke="${col}" stroke-width="2.2" filter="url(#${g})"/><path d="${chamfer(x + 8, y + 8, w - 16, hh - 16, c - 6)}" fill="none" stroke="${col}" stroke-width=".8" opacity=".45"/>`;
  }
  const scanlines = (x, y, w, hh, op = .07, step = 4) => { const p = id('sl'); return `<defs><pattern id="${p}" width="${step}" height="${step}" patternUnits="userSpaceOnUse"><rect width="${step}" height="1" fill="${C.paper}" opacity="${op}"/></pattern></defs><rect x="${x}" y="${y}" width="${w}" height="${hh}" fill="url(#${p})"/>`; };
  function hexGrid(x0, y0, cols, rows, r = 22, col = glow, op = .3, fadeDir = 0) {
    let s = ''; const dx = r * Math.sqrt(3), dy = r * 1.5;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const cx = x0 + i * dx + (j % 2 ? dx / 2 : 0), cy = y0 + j * dy; let d = '';
      for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; d += `${k ? 'L' : 'M'}${f1(cx + r * Math.cos(a))} ${f1(cy + r * Math.sin(a))}`; }
      const o = fadeDir ? op * Math.max(0, 1 - (fadeDir > 0 ? i / cols : 1 - i / cols)) : op; if (o < .02) continue;
      s += `<path d="${d}Z" fill="none" stroke="${col}" stroke-width="1.2" opacity="${f1(o * 100) / 100}"/>`;
    }
    return s;
  }
  function ruler(x1, x2, y, col = glow, dir = -1, major = 10) {
    let s = lin(x1, y, x2, y, col, 1.4, .9); let i = 0;
    for (let x = x1; x <= x2; x += 12, i++) s += lin(x, y, x, y + dir * (i % major ? 6 : 16), col, 1.2, i % major ? .55 : .9);
    return s;
  }
  function vruler(x, y1, y2, col = glow, dir = 1) { let s = lin(x, y1, x, y2, col, 1.4, .8); let i = 0; for (let y = y1; y <= y2; y += 12, i++) s += lin(x, y, x + dir * (i % 10 ? 6 : 16), y, col, 1.2, i % 10 ? .5 : .9); return s; }
  const segBar = (x, y, n, filled, col, w = 22, hh = 8, gap = 5) => Array.from({ length: n }, (_, i) => `<rect width="${w}" height="${hh}" fill="${col}" opacity="${i < filled ? .95 : .22}" transform="translate(${f1(x + i * (w + gap))},${f1(y)}) skewX(-20)"/>`).join('');
  function hudCorners(x, y, w, hh, len = 70, col = glow, sw = 3) {
    const c = 14; return `<g fill="none" stroke="${col}" stroke-width="${sw}"><path d="M${x} ${y + len}V${y + c}L${x + c} ${y}H${x + len}"/><path d="M${x + w - len} ${y}H${x + w - c}L${x + w} ${y + c}V${y + len}"/><path d="M${x + w} ${y + hh - len}V${y + hh - c}L${x + w - c} ${y + hh}H${x + w - len}"/><path d="M${x + len} ${y + hh}H${x + c}L${x} ${y + hh - c}V${y + hh - len}"/></g>`;
  }
  function reticle(cx, cy, r, col = glow) {
    return `<g fill="none" stroke="${col}"><circle cx="${cx}" cy="${cy}" r="${r}" stroke-width="2" stroke-dasharray="${f1(r * .5)} ${f1(r * .28)}"/><circle cx="${cx}" cy="${cy}" r="${f1(r * .62)}" stroke-width="1" opacity=".6"/></g>` + lin(cx - r - 18, cy, cx - r + 10, cy, col, 2) + lin(cx + r - 10, cy, cx + r + 18, cy, col, 2) + lin(cx, cy - r - 18, cx, cy - r + 10, col, 2) + lin(cx, cy + r - 10, cx, cy + r + 18, col, 2);
  }
  const readout = (x, y, label, col = glow, anchor = 'start', size = 15) => `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${fNum}" font-weight="${wNum}" font-size="${size}" letter-spacing="4" fill="${col}" opacity=".8">${esc(label)}</text>`;
  const code = (seed) => { const r = rng(seed); return Array.from({ length: 3 }, () => Math.floor(r() * 4096).toString(16).toUpperCase().padStart(3, '0')).join('·'); };

  // ---------- layouts ----------
  E.layouts = function (bar, acc) {
    const B = bar ? H - BAR : H; const L = {};
    L.A_hologram = { pieces: {
        scrim_top: h.scrimTop(330, .85), scrim_bottom: h.scrimBottom(B, 420, .92), scanlines: scanlines(0, 0, W, B),
        hud_corners: hudCorners(30, 30, W - 60, B - 60, 90),
        title_ruler: ruler(660, 1260, 262, acc, 1) + readout(660, 300, `ARCHIVE ${code(3)}`, glow, 'start', 13) + readout(1260, 300, 'SIGNAL ▮▮▮▯', glow, 'end', 13),
        bottom_bars: segBar(800, B - 196, 12, 8, glow) },
      accentPieces: ['title_ruler'],
      guides: [G('en1', 'ENGLISH 1 · eyebrow', 560, 96, 800, 40), G('en2', 'ENGLISH 2 · title', 260, 136, 1400, 104), G('face', 'KEEP FACE CLEAR OF TEXT', 560, 320, 800, B - 560), G('bn', 'BANGLA', 260, B - 172, 1400, 100), G('tag', 'TAG · hex', 1640, B - 330, 210, 210, { tag: 'hex' })] };
    L.B_data_panel_left = { pieces: {
        data_panel: panel(56, 56, 1020, 300, 28) + readout(96, 334, `DATA FILE // ${code(7)}`, glow, 'start', 13),
        accent_bar: segBar(100, 272, 14, 9, acc, 26, 9, 6),
        hex_patch: hexGrid(1560, 40, 9, 9, 26, glow, .28, 1),
        bottom_panel: panel(56, B - 196, W - 112, 160, 22, .85),
        hud_corners: hudCorners(20, 20, W - 40, B - 40, 60, glow, 2) },
      accentPieces: ['accent_bar'],
      guides: [G('en1', 'ENGLISH 1', 100, 84, 940, 40, { align: 'start' }), G('en2', 'ENGLISH 2', 96, 128, 950, 110, { align: 'start' }), G('tag', 'TAG · hex / ring', 1600, 60, 260, 260, { tag: 'hex', shape: 'circle' }), G('face', 'FACE / CHARACTER ZONE', 1100, 380, 720, B - 620), G('bn', 'BANGLA', 100, B - 166, 1720, 100, { align: 'start' })] };
    const T = 150, Bb = bar ? 866 : 910;
    const topBar = `M0 0H${W}V${T - 10}H1220L1180 ${T + 22}H740L700 ${T - 10}H0Z`, botBar = `M0 ${H}H${W}V${Bb + 10}H1220L1180 ${Bb - 22}H740L700 ${Bb + 10}H0Z`;
    L.C_cockpit = { barStyle: 'clear', pieces: (() => { const [g, gf] = glowF(); return {
        bars: `<path d="${topBar}" fill="${C.ink}"/><path d="${botBar}" fill="${C.ink}"/>`,
        bar_edges: `<defs>${gf}</defs><path d="M0 ${T - 10}H700L740 ${T + 22}H1180L1220 ${T - 10}H${W}" fill="none" stroke="${glow}" stroke-width="2.5" filter="url(#${g})"/><path d="M0 ${Bb + 10}H700L740 ${Bb - 22}H1180L1220 ${Bb + 10}H${W}" fill="none" stroke="${glow}" stroke-width="2.5" filter="url(#${g})"/>`,
        rulers: ruler(80, 640, T - 10, glow, 1) + ruler(1280, W - 80, T - 10, glow, 1) + vruler(36, T + 60, Bb - 60, glow, 1) + vruler(W - 36, T + 60, Bb - 60, glow, -1),
        scanlines: scanlines(0, T, W, Bb - T, .05) }; })(),
      accentPieces: [],
      guides: [G('en1', 'ENGLISH 1', 560, 24, 800, 34), G('en2', 'ENGLISH 2', 260, 60, 1400, 76), G('face', 'IMAGE STAYS CLEAR', 80, T + 40, W - 160, Bb - T - 80), G('tag', 'TAG · chip', 840, Bb - 18, 240, 70, { tag: 'chip' }), G('bn', 'BANGLA', 260, Bb + 56, 1400, bar ? 70 : 110)] };
    const win = bar ? { x: 432, y: 186, w: 1056, h: 594 } : { x: 400, y: 190, w: 1120, h: 630 };
    const hole = `M0 0H${W}V${B}H0Z ` + chamfer(win.x, win.y, win.w, win.h, 34);
    L.D_viewscreen = { pieces: (() => { const [g, gf] = glowF(); const pc = id('vc'); return {
        console_fill: `<defs><clipPath id="${pc}"><path clip-rule="evenodd" d="${hole}"/></clipPath></defs><path fill-rule="evenodd" d="${hole}" fill="${C.ink}"/><g clip-path="url(#${pc})">${hexGrid(0, 0, 46, 30, 26, glow, .12)}${scanlines(0, 0, W, B, .05)}</g>`,
        screen_frame: `<defs>${gf}</defs><path d="${chamfer(win.x - 6, win.y - 6, win.w + 12, win.h + 12, 38)}" fill="none" stroke="${glow}" stroke-width="3" filter="url(#${g})"/><path d="${chamfer(win.x - 20, win.y - 20, win.w + 40, win.h + 40, 46)}" fill="none" stroke="${glow}" stroke-width="1" opacity=".5"/>`,
        side_consoles: [win.x / 2, W - win.x / 2].map((cx, k) => segBar(cx - 60, win.y + 40, 4, 3, acc, 22, 8, 6) + vruler(cx + (k ? 60 : -60), win.y + 90, win.y + win.h - 40, glow, k ? -1 : 1) + readout(cx, win.y + win.h - 10, code(11 + k), glow, 'middle', 12)).join('') }; })(),
      accentPieces: ['side_consoles'],
      guides: [G('en1', 'ENGLISH 1', 560, 30, 800, 34), G('en2', 'ENGLISH 2', 330, 66, 1260, win.y - 110), G('face', `IMAGE ${win.w}×${win.h} at x${win.x} y${win.y}`, win.x, win.y, win.w, win.h), G('tag', 'TAG (side)', 70, win.y + win.h / 2 - 105, 210, 210, { tag: 'ring' }), G('bn', 'BANGLA', 330, win.y + win.h + 52, 1260, B - win.y - win.h - 70)] };
    L.E_scanline = { pieces: { scrim_top: h.scrimTop(280, .75), scrim_bottom: h.scrimBottom(B, 360, .9), scanlines: scanlines(0, 0, W, B, .06), hud_corners: hudCorners(24, 24, W - 48, B - 48, 110, glow, 3), rulers: ruler(560, 1360, 236, glow, -1) + ruler(560, 1360, B - 196, glow, 1) },
      accentPieces: [],
      guides: [G('en1', 'ENGLISH 1', 560, 70, 800, 36), G('en2', 'ENGLISH 2', 260, 110, 1400, 96), G('tag', 'TAG · chip', 1600, 56, 240, 70, { tag: 'chip' }), G('face', 'FACE ZONE', 460, 260, 1000, B - 490), G('bn', 'BANGLA', 260, B - 160, 1400, 100)] };
    const term = `M0 0H760V${B - 90}L680 ${B}H0Z`;
    L.F_terminal_left = { pieces: (() => { const [g, gf] = glowF(); const tc = id('tc'); return {
        terminal_panel: `<defs><clipPath id="${tc}"><path d="${term}"/></clipPath></defs><path d="${term}" fill="${C.ink}" opacity=".92"/><g clip-path="url(#${tc})">${hexGrid(380, 0, 18, 32, 24, glow, .14, 1)}${scanlines(0, 0, 760, B, .05)}</g>`,
        panel_edge: `<defs>${gf}</defs><path d="M760 -10V${B - 90}L680 ${B + 10}" fill="none" stroke="${glow}" stroke-width="3" filter="url(#${g})"/>`,
        side_ruler: vruler(40, 90, B - 90, glow, 1),
        accent_bar: segBar(96, 338, 14, 9, acc, 26, 9, 6) }; })(),
      accentPieces: ['accent_bar'],
      guides: [G('en1', 'ENGLISH 1', 90, 100, 600, 36, { align: 'start' }), G('en2', 'ENGLISH 2', 90, 142, 600, 176, { align: 'start' }), G('tag', 'TAG · chip', 90, 384, 240, 70, { tag: 'chip' }), G('bn', 'BANGLA (2–3 lines)', 90, B - 300, 560, 210, { align: 'start' }), G('face', 'CHARACTER SIDE', 820, 70, 1040, B - 140)] };
    for (const k of Object.keys(L)) if (/_left$/.test(k)) {
      const src = L[k];
      L[k.replace(/_left$/, '_right')] = { barStyle: src.barStyle, accentPieces: src.accentPieces, pieces: Object.fromEntries(Object.entries(src.pieces).map(([n, v]) => [n, mirror(v)])),
        guides: src.guides.map((g) => Object.assign({}, g, { x: W - g.x - g.w, align: g.align === 'start' ? 'end' : g.align === 'end' ? 'start' : g.align })) };
    }
    return L;
  };

  // ---------- tags ----------
  const footer = theme.tagFooter || 'MUSINGS OF MAKSUD';
  E.TAGS.hex = { box: [300, 300], fam: 'scifi', fn(s, n) {
    const hx = (r) => { let d = ''; for (let k = 0; k < 6; k++) { const a = -Math.PI / 2 + k * Math.PI / 3; d += `${k ? 'L' : 'M'}${f1(150 + r * Math.cos(a))} ${f1(150 + r * Math.sin(a))}`; } return d + 'Z'; };
    const [g, gf] = glowF();
    return `<defs>${gf}</defs><path d="${hx(142)}" fill="${C.ink}" opacity=".92"/><path d="${hx(142)}" fill="none" stroke="${s.accent}" stroke-width="6" filter="url(#${g})"/><path d="${hx(118)}" fill="none" stroke="${glow}" stroke-width="1.5" opacity=".7"/>
    ${txt(150, 112, esc(s.code), { size: h.codeSize(s.code, 30, 150), font: fDisplay, weight: wDisplay, fill: C.paper, anchor: 'middle', ls: 5, shadowEpic: false, maxw: 150 })}
    ${txt(150, 196, String(n), { size: h.numSize(n, 80), font: fNum, weight: wNum, fill: s.accent, anchor: 'middle', ls: 2, shadowEpic: false, maxw: 170 })}
    ${segBar(104, 214, 5, Math.max(1, n % 6), glow, 14, 6, 6)}
    <text x="150" y="246" text-anchor="middle" font-family="${fNum}" font-weight="${wNum}" font-size="10" letter-spacing="3" fill="${glow}" data-maxw="150">${esc(footer)}</text>`; } };
  E.TAGS.ring = { box: [300, 300], fam: 'scifi', fn(s, n) {
    const [g, gf] = glowF();
    return `<defs>${gf}</defs><circle cx="150" cy="150" r="138" fill="${C.ink}" opacity=".9"/><circle cx="150" cy="150" r="132" fill="none" stroke="${s.accent}" stroke-width="10" stroke-dasharray="60 12" filter="url(#${g})" transform="rotate(-90 150 150)"/><circle cx="150" cy="150" r="108" fill="none" stroke="${glow}" stroke-width="1.5" opacity=".7"/>
    ${Array.from({ length: 36 }, (_, i) => { const a = i * Math.PI / 18; return lin(150 + 100 * Math.cos(a), 150 + 100 * Math.sin(a), 150 + (i % 3 ? 94 : 88) * Math.cos(a), 150 + (i % 3 ? 94 : 88) * Math.sin(a), glow, 1.2, .7); }).join('')}
    ${txt(150, 118, esc(s.code), { size: h.codeSize(s.code, 28, 140), font: fDisplay, weight: wDisplay, fill: C.paper, anchor: 'middle', ls: 5, shadowEpic: false, maxw: 140 })}
    ${txt(150, 200, String(n), { size: h.numSize(n, 78), font: fNum, weight: wNum, fill: C.paper, anchor: 'middle', ls: 2, shadowEpic: false, maxw: 160 })}`; } };
  E.TAGS.chip = { box: [240, 70], fam: 'scifi', fn(s, n) {
    return `<path d="${chamfer(3, 3, 234, 64, 14)}" fill="${C.ink}" stroke="${s.accent}" stroke-width="2.5"/><path d="${chamfer(3, 3, 86, 64, 14)}" fill="${s.accent}"/>
    <text x="46" y="44" text-anchor="middle" font-family="${fDisplay}" font-weight="${wDisplay}" font-size="22" letter-spacing="2" fill="${C.ink}" data-maxw="72">${esc(s.code)}</text>
    <text x="164" y="47" text-anchor="middle" font-family="${fNum}" font-weight="${wNum}" font-size="34" letter-spacing="2" fill="${C.paper}" data-maxw="130">${n}</text>`; } };
  E.TAGS.barcode = { box: [260, 90], fam: 'scifi', fn(s, n) {
    const r = rng(n * 17 + s.code.length); let x = 14, bars = ''; while (x < 104) { const w = 1 + Math.floor(r() * 4); bars += `<rect x="${x}" y="16" width="${w}" height="58" fill="${C.paper}"/>`; x += w + 1 + Math.floor(r() * 3); }
    return `<rect x="3" y="3" width="254" height="84" fill="${C.ink}" stroke="${glow}" stroke-width="1.5"/>${bars}<rect x="112" y="16" width="3" height="58" fill="${s.accent}"/>
    <text x="186" y="44" text-anchor="middle" font-family="${fDisplay}" font-weight="${wDisplay}" font-size="20" letter-spacing="3" fill="${s.accent}" data-maxw="130">${esc(s.code)}</text>
    <text x="186" y="74" text-anchor="middle" font-family="${fNum}" font-weight="${wNum}" font-size="28" letter-spacing="2" fill="${C.paper}" data-maxw="130">${n}</text>`; } };
  E.tagStyles = ['hex', 'ring', 'chip', 'barcode'];
  Object.assign(E.TAG_FOLDERS, { hex: 'Hex_badge', ring: 'HUD_ring', chip: 'Chip', barcode: 'Barcode_label' });

  // ---------- follow bar ----------
  E.followBar = function (bg, iconStyle = 'theme', y = H - BAR) {
    const cy = y + BAR / 2; let s = ''; const [g, gf] = glowF();
    const strip = `M0 ${y + 14}H260L284 ${y}H${W}V${y + BAR}H0Z`;
    if (bg === 'solid' || bg === 'feature') s += `<path d="${strip}" fill="${C.ink}" opacity=".95"/>`;
    if (bg === 'glass') s += `<path d="${strip}" fill="${C.ink}" opacity=".6"/>`;
    if (bg === 'feature') s += scanlines(0, y, W, BAR, .08) + ruler(1100, 1500, y + BAR - 10, glow, -1);
    s += `<defs>${gf}</defs><path d="M0 ${y + 14}H260L284 ${y}H${W}" fill="none" stroke="${glow}" stroke-width="2.2" filter="url(#${g})"/>`;
    s += txt(72, cy + 13, esc(theme.followText || 'FOLLOW'), { size: 20, font: fDisplay, weight: wDisplay, fill: glow, anchor: 'start', ls: 6, shadowEpic: false, maxw: 130 });
    const mono = iconStyle === 'brand' ? null : iconStyle === 'paper' ? C.paper : iconStyle === 'ink' ? C.ink : glow;
    s += E.icons(mono, 220, cy - 17, 36, 16);
    s += segBar(400, cy - 1, 8, 5, glow, 20, 6, 8);
    s += txt(W - 72, cy + 11, h.handleMarkup(glow), { size: 30, font: fHandle, weight: wHandle, fill: C.paper, anchor: 'end', ls: 1, shadowEpic: false, maxw: 760 });
    return s;
  };

  // ---------- lines + extras ----------
  const baseLines = E.lines;
  E.lines = (accents) => {
    const Lz = baseLines(accents);
    for (const [nm, col] of accents) { Lz[`segment_bar_${nm}`] = [400, 20, () => segBar(10, 6, 12, 8, col, 24, 8, 6)]; Lz[`chip_blank_${nm}`] = [240, 70, () => `<path d="${chamfer(3, 3, 234, 64, 14)}" fill="${C.ink}" stroke="${col}" stroke-width="2.5"/>`]; }
    Object.assign(Lz, {
      ruler: [1800, 24, () => ruler(4, 1796, 4, glow, 1)], ruler_vertical: [24, 900, () => vruler(4, 4, 896, glow, 1)],
      hud_corner_set: [400, 240, () => hudCorners(4, 4, 392, 232, 60, glow, 3)], reticle: [220, 220, () => reticle(110, 110, 80)],
      hex_patch: [500, 300, () => hexGrid(20, 20, 10, 8, 24, glow, .6, 1)], panel_blank: [700, 220, () => panel(4, 4, 692, 212, 26, .85)],
      readout_strip: [700, 30, () => readout(4, 22, `ARCHIVE ${code(21)} // SIGNAL ▮▮▮▮▯ // ${code(22)}`, glow, 'start', 16)],
    });
    return Lz;
  };
  const baseExtras = E.extras;
  E.extras = (accents) => Object.assign(baseExtras(accents), {
    scanlines_full: scanlines(0, 0, W, H, .07), hex_grid_left: hexGrid(0, 0, 12, 30, 26, glow, .3, 1), hex_grid_right: mirror(hexGrid(0, 0, 12, 30, 26, glow, .3, 1)),
    hud_frame: hudCorners(24, 24, W - 48, H - 48, 120, glow, 3) + ruler(560, 1360, 40, glow, 1) + ruler(560, 1360, H - 40, glow, -1),
    reticle_center: reticle(W / 2, H / 2, 300), console_frame: panel(30, 30, W - 60, H - 60, 40, 0),
  });
  E.lookName = 'scifi';
  return E;
};
