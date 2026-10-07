// Overlay-pack engine: turns a theme (theme.json) into SVG markup for every asset.
// Canvas is fixed at 16:9 (1920x1080 design units); build.js renders at 2x.
// Two style families: "comic" (halftone, action lines, outlined lettering) and
// "epic" (metal frames, soft scrims, engraved look). Fandom flavour comes from
// colours, fonts and motif ornaments (see MOTIFS).

const W = 1920, H = 1080, BAR = 84;

function makeEngine(theme) {
  // base text treatment: comic (outlined lettering) or epic (clean with soft shadow); custom looks pick one
  const fam = (theme.family || (theme.look === 'comic' ? 'comic' : 'epic')) === 'comic' ? 'comic' : 'epic';
  const self = {};
  const C = Object.assign({ ink: '#0D0A08', paper: '#F4EBD9', metal: '#C9A961', hi: '#F5C842', muted: '#A89878', panel: '#1A1410' }, theme.colors || {});
  const F = theme.fonts;
  const fDisplay = `'${F.display.family}', Impact, serif`;
  const fNum = `'${(F.numbers || F.display).family}', Impact, serif`;
  const fHandle = `'${(F.handle || F.numbers || F.display).family}', Impact, serif`;
  const fBangla = `'${(F.bangla || { family: 'Somoyer Srot' }).family}', 'Noto Serif Bengali', serif`;
  const wDisplay = F.display.weight || 400, wNum = (F.numbers || F.display).weight || 400, wHandle = (F.handle || F.numbers || F.display).weight || 400;
  const motifs = theme.motifs && theme.motifs.length ? theme.motifs : [fam === 'comic' ? 'zigzag' : 'dots'];
  const M0 = motifs[0];
  const handle = theme.handle || '@MusingsofMaksud';
  const handleUpper = theme.handleCase === 'upper';
  let uid = 0; const id = (p) => `${p}${++uid}`;
  const f1 = (n) => (+n).toFixed(1);
  const rng = (seed) => { let s = (Math.abs(seed) * 7919 + 104729) % 233280; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); };
  const mirror = (s) => `<g transform="translate(${W},0) scale(-1,1)">${s}</g>`;
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');

  // ---------------- shared primitives ----------------
  const lin = (x1, y1, x2, y2, col = C.metal, w = 1.5, op = 1) => `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" stroke="${col}" stroke-width="${w}" opacity="${op}"/>`;
  const diamond = (cx, cy, s, col) => `<rect x="${f1(cx - s / 2)}" y="${f1(cy - s / 2)}" width="${s}" height="${s}" fill="${col}" transform="rotate(45 ${f1(cx)} ${f1(cy)})"/>`;
  const dot = (cx, cy, r, col = C.metal, op = 1) => `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${r}" fill="${col}" opacity="${op}"/>`;
  const grad = (gid, dir, stops) => { const [x2, y2] = dir === 'h' ? [1, 0] : [0, 1]; return `<linearGradient id="${gid}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('')}</linearGradient>`; };
  const outlined = (d, fill, sw = 4, shadow = 6) => (shadow ? `<path d="${d}" fill="${C.ink}" transform="translate(${shadow},${shadow})"/>` : '') + `<path d="${d}" fill="${fill}" stroke="${C.ink}" stroke-width="${sw}" stroke-linejoin="round"/>`;
  function star(cx, cy, r, fill, outline = true) {
    let d = ''; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .45 : r; d += `${i ? 'L' : 'M'}${f1(cx + rr * Math.cos(a))} ${f1(cy + rr * Math.sin(a))}`; }
    return outline ? outlined(d + 'Z', fill, 3, 3) : `<path d="${d}Z" fill="${fill}"/>`;
  }
  function halftoneBand(y0, y1, dir, col = C.ink, step = 16, maxR = 7.6, x0 = 0, x1 = W) {
    let s = ''; let row = 0;
    for (let y = y0 + step / 2; y < y1; y += step * .866, row++) {
      const t = dir === 'down' ? 1 - (y - y0) / (y1 - y0) : (y - y0) / (y1 - y0); const r = maxR * Math.pow(t, 1.15); if (r < .7) continue;
      for (let x = x0 + (row % 2 ? step / 2 : 0); x < x1 + step; x += step) s += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}"/>`;
    }
    return `<g fill="${col}">${s}</g>`;
  }
  function halftoneSide(x0, x1, dir, B = H, col = C.ink, step = 16, maxR = 7.6) {
    let s = ''; let c = 0;
    for (let x = x0 + step / 2; x < x1; x += step * .866, c++) {
      const t = dir === 'right' ? 1 - (x - x0) / (x1 - x0) : (x - x0) / (x1 - x0); const r = maxR * Math.pow(t, 1.15); if (r < .7) continue;
      for (let y = (c % 2 ? step / 2 : 0); y < B + step; y += step) s += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}"/>`;
    }
    return `<g fill="${col}">${s}</g>`;
  }
  function focusLines(seed, col = C.ink, op = .8, cx = W / 2, cy = H / 2, rIn = [560, 680], n = 150, ky = .6, R = 2400) {
    const r = rng(seed); let d = '';
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (r() - .5) * .03, w = .004 + r() * .012, ri = rIn[0] + r() * (rIn[1] - rIn[0]);
      d += `M${f1(cx + ri * Math.cos(a))} ${f1(cy + ri * ky * Math.sin(a))}L${f1(cx + R * Math.cos(a - w))} ${f1(cy + R * ky * Math.sin(a - w))}L${f1(cx + R * Math.cos(a + w))} ${f1(cy + R * ky * Math.sin(a + w))}Z`;
    }
    return `<path d="${d}" fill="${col}" opacity="${op}"/>`;
  }
  function speedLines(seed, side, y0, y1, col = C.ink, op = .85, len = [200, 560], n = 30, w0 = W) {
    const r = rng(seed); let d = '';
    for (let i = 0; i < n; i++) {
      const y = y0 + r() * (y1 - y0), L = len[0] + r() * (len[1] - len[0]), h = 1.5 + r() * 4.5;
      d += side === 'left' ? `M0 ${f1(y - h)}L${f1(L)} ${f1(y)}L0 ${f1(y + h)}Z` : `M${w0} ${f1(y - h)}L${f1(w0 - L)} ${f1(y)}L${w0} ${f1(y + h)}Z`;
    }
    return `<path d="${d}" fill="${col}" opacity="${op}"/>`;
  }
  function zigzag(x1, x2, y, col, amp = 9, seg = 18, w = 7) {
    let pts = `${x1},${y}`; let up = true; for (let x = x1 + seg; x <= x2; x += seg, up = !up) pts += ` ${x},${up ? y - amp : y + amp}`;
    return `<polyline points="${pts}" fill="none" stroke="${C.ink}" stroke-width="${w + 6}" stroke-linejoin="miter" stroke-linecap="round"/><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linejoin="miter" stroke-linecap="round"/>`;
  }
  const brush = (x, y, w, h, col) => outlined(`M${x} ${y + h * .35}C${x + w * .3} ${y - h * .05} ${x + w * .7} ${y - h * .1} ${x + w} ${y}L${x + w - 10} ${y + h * .55}C${x + w * .65} ${y + h * .5} ${x + w * .3} ${y + h * .7} ${x + 10} ${y + h}Z`, col, 3, 4);
  function burstPath(cx, cy, ro, ri, k, seed, jit = 12) { const r = rng(seed); let d = ''; for (let i = 0; i < k * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / k, rr = (i % 2 ? ri : ro) + (r() - .5) * jit; d += `${i ? 'L' : 'M'}${f1(cx + rr * Math.cos(a))} ${f1(cy + rr * Math.sin(a))}`; } return d + 'Z'; }
  function sunburst(cx, cy, colA, colB, rays = 44, R = 2600, w = W, h = H) {
    let d = ''; for (let i = 0; i < rays; i += 2) { const a1 = i / rays * Math.PI * 2, a2 = (i + 1) / rays * Math.PI * 2; d += `M${cx} ${cy}L${f1(cx + R * Math.cos(a1))} ${f1(cy + R * Math.sin(a1))}L${f1(cx + R * Math.cos(a2))} ${f1(cy + R * Math.sin(a2))}Z`; }
    return `<rect width="${w}" height="${h}" fill="${colA}"/><path d="${d}" fill="${colB}"/>`;
  }

  // ---------------- motif ornaments (horizontal bands) ----------------
  // motif(name, x1, x2, y, col, h): a band centred on y, about h tall.
  const MOTIFS = {
    dots(x1, x2, y, col, h) { let s = lin(x1, y, x2, y, col, 1.2, .8); const cx = (x1 + x2) / 2; s += diamond(cx, y, h * .8, col); for (const k of [1, 2]) { s += dot(cx - k * h * 1.4, y, h * .22, col) + dot(cx + k * h * 1.4, y, h * .22, col); } return s; },
    zigzag(x1, x2, y, col, h) { return zigzag(x1, x2, y, col, h * .45, h * .9, Math.max(4, h * .35)); },
    meander(x1, x2, y, col, h) {
      const u = h, sw = Math.max(1.4, h / 8), top = y - h / 2; let d = '';
      for (let x = x1; x + u <= x2 + .1; x += u) d += `M${f1(x)} ${f1(top + u)}V${f1(top)}H${f1(x + u * .78)}V${f1(top + u * .62)}H${f1(x + u * .3)}V${f1(top + u * .32)}H${f1(x + u * .52)}`;
      return `<path d="${d}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="square"/>` + lin(x1, top + u, x2, top + u, col, sw) + lin(x1, top - sw * 1.6, x2, top - sw * 1.6, col, sw * .7, .8);
    },
    waves(x1, x2, y, col, h) {
      let s = ''; for (let k = -1; k <= 1; k++) { let d = `M${x1} ${f1(y + k * h * .35)}`; const p = h * 3.2; for (let x = x1; x < x2; x += p) d += `Q${f1(x + p / 4)} ${f1(y + k * h * .35 - h * .28)} ${f1(x + p / 2)} ${f1(y + k * h * .35)}T${f1(Math.min(x + p, x2))} ${f1(y + k * h * .35)}`; s += `<path d="${d}" fill="none" stroke="${col}" stroke-width="${k ? 1.2 : 2}" opacity="${k ? .6 : 1}"/>`; } return s;
    },
    runes(x1, x2, y, col, h) {
      const r = rng(x1 + x2 + h); let s = lin(x1, y + h * .62, x2, y + h * .62, col, 1.2, .8) + lin(x1, y - h * .62, x2, y - h * .62, col, 1.2, .8); const step = h * 1.25;
      for (let x = x1 + step / 2; x < x2 - step / 3; x += step) {
        const t = Math.floor(r() * 6), a = h * .42, b = h * .3; let d = `M${f1(x)} ${f1(y - a)}V${f1(y + a)}`;
        if (t === 0) d += `M${f1(x)} ${f1(y - a)}L${f1(x + b)} ${f1(y - a + b)}`; if (t === 1) d += `M${f1(x)} ${f1(y)}L${f1(x + b)} ${f1(y - b)}M${f1(x)} ${f1(y)}L${f1(x + b)} ${f1(y + b)}`;
        if (t === 2) d += `M${f1(x - b)} ${f1(y - a + b * .4)}L${f1(x + b)} ${f1(y + a - b * .4)}`; if (t === 3) d += `M${f1(x)} ${f1(y - a)}L${f1(x + b)} ${f1(y - a + b * .8)}L${f1(x)} ${f1(y)}`;
        if (t === 4) d += `M${f1(x - b)} ${f1(y - b)}L${f1(x)} ${f1(y)}L${f1(x + b)} ${f1(y - b)}`; if (t === 5) d += `M${f1(x)} ${f1(y - a * .3)}L${f1(x + b)} ${f1(y - a * .3 - b * .6)}M${f1(x)} ${f1(y + a * .2)}L${f1(x + b)} ${f1(y + a * .2 - b * .6)}`;
        s += `<path d="${d}" fill="none" stroke="${col}" stroke-width="${Math.max(1.6, h / 9)}" stroke-linecap="round" stroke-linejoin="round"/>`;
      }
      return s;
    },
    leaves(x1, x2, y, col, h) {
      let s = lin(x1, y, x2, y, col, 1.4); const step = h * 1.1; let i = 0;
      for (let x = x1 + step / 2; x < x2 - step / 3; x += step, i++) { const up = i % 2 ? -1 : 1; s += `<ellipse cx="${f1(x)}" cy="${f1(y + up * h * .28)}" rx="${f1(h * .42)}" ry="${f1(h * .16)}" fill="${col}" transform="rotate(${up * -28} ${f1(x)} ${f1(y + up * h * .28)})"/>`; }
      return s;
    },
    lightning(x1, x2, y, col, h) {
      const seg = h * 1.6; let d = `M${x1} ${y}`; let i = 0; for (let x = x1 + seg; x <= x2; x += seg, i++) d += `L${f1(x - seg * .45)} ${f1(y + (i % 2 ? h * .45 : -h * .45))}L${f1(x)} ${f1(y)}`;
      return `<path d="${d}" fill="none" stroke="${col}" stroke-width="${Math.max(2, h / 6)}" stroke-linejoin="miter"/>` + diamond((x1 + x2) / 2, y, h * .55, col);
    },
    stars(x1, x2, y, col, h) {
      let s = ''; for (let x = x1; x <= x2; x += h * .7) s += dot(x, y, Math.max(1, h * .07), col, .7); const cx = (x1 + x2) / 2;
      const tw = (cx_, r_) => `<path d="M${f1(cx_)} ${f1(y - r_)}Q${f1(cx_)} ${f1(y)} ${f1(cx_ + r_)} ${f1(y)}Q${f1(cx_)} ${f1(y)} ${f1(cx_)} ${f1(y + r_)}Q${f1(cx_)} ${f1(y)} ${f1(cx_ - r_)} ${f1(y)}Q${f1(cx_)} ${f1(y)} ${f1(cx_)} ${f1(y - r_)}Z" fill="${col}"/>`;
      return s + tw(cx, h * .7) + tw(cx - h * 2.2, h * .4) + tw(cx + h * 2.2, h * .4);
    },
    hud(x1, x2, y, col, h) {
      let s = lin(x1 + h, y, x2 - h, y, col, 1.4) + `<path d="M${x1 + h * .6} ${f1(y - h * .45)}H${x1}V${f1(y + h * .45)}H${x1 + h * .6}M${x2 - h * .6} ${f1(y - h * .45)}H${x2}V${f1(y + h * .45)}H${x2 - h * .6}" fill="none" stroke="${col}" stroke-width="2"/>`;
      for (let x = x1 + h * 2; x < x2 - h * 2; x += h * .8) s += lin(x, y, x, y - h * (Math.round((x - x1) / (h * .8)) % 5 ? .18 : .4), col, 1.2, .8);
      const cx = (x1 + x2) / 2; return s + `<rect x="${f1(cx - h * 1.6)}" y="${f1(y - h * .22)}" width="${f1(h * 3.2)}" height="${f1(h * .44)}" fill="${col}"/>`;
    },
  };
  const motif = (name, x1, x2, y, col, h = 18) => (MOTIFS[name] || MOTIFS.dots)(x1, x2, y, col, h);

  // ---------------- text ----------------
  // comic lettering: offset ink shadow + outline. epic: clean with soft shadow.
  function txt(x, y, body, o = {}) {
    const { size = 40, fill = C.paper, font = fDisplay, weight = wDisplay, anchor = 'middle', ls = 1, rot = 0, comic = fam === 'comic', sw = size * .13, shadow = size * .07, maxw = 0 } = o;
    const fitAttr = maxw ? ` data-maxw="${f1(maxw)}"` : '';
    const base = `x="${f1(x)}" y="${f1(y)}" text-anchor="${anchor}" font-family="${font}" font-weight="${weight}" font-size="${f1(size)}" letter-spacing="${ls}"${fitAttr}`;
    let t;
    if (comic) t = (shadow ? `<text ${base} fill="${C.ink}" stroke="${C.ink}" stroke-width="${f1(sw)}" stroke-linejoin="round" transform="translate(${f1(shadow)},${f1(shadow)})">${body}</text>` : '') + `<text ${base} fill="${fill}" stroke="${C.ink}" stroke-width="${f1(sw)}" stroke-linejoin="round" paint-order="stroke fill">${body}</text>`;
    else t = (o.shadowEpic !== false ? `<text ${base} fill="#000" opacity=".55" transform="translate(2,3)">${body}</text>` : '') + `<text ${base} fill="${fill}">${body}</text>`;
    return rot ? `<g transform="rotate(${rot} ${f1(x)} ${f1(y)})">${t}</g>` : t;
  }
  const estW = (s, size, k = .6) => String(s).length * size * k;

  // ---------------- social icons + follow bar ----------------
  const FB_F = 'M27.5 25.8l.9-5.8h-5.6v-3.8c0-1.6.8-3.1 3.3-3.1h2.5V8.1s-2.3-.4-4.5-.4c-4.6 0-7.6 2.8-7.6 7.8v4.5h-5.1v5.8h5.1V40h6.3V25.8z';
  function icons(mono, x0, y0, size = 36, gap = 14) {
    // mono: a colour string, or null for brand colours
    const k = size / 36, out = [];
    { const m = id('ytm'), tri = 'M14.5 11.5L24.5 18L14.5 24.5Z';
      out.push(mono ? `<defs><mask id="${m}"><rect width="36" height="36" fill="#fff"/><path d="${tri}" fill="#000"/></mask></defs><rect y="5" width="36" height="26" rx="7.5" fill="${mono}" mask="url(#${m})"/>` : `<rect y="5" width="36" height="26" rx="7.5" fill="#FF0000"/><path d="${tri}" fill="#fff"/>`); }
    { let st = mono, defs = ''; if (!mono) { const g = id('ig'); defs = `<defs><linearGradient id="${g}" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#FEDA75"/><stop offset=".3" stop-color="#FA7E1E"/><stop offset=".55" stop-color="#D62976"/><stop offset=".8" stop-color="#962FBF"/><stop offset="1" stop-color="#4F5BD5"/></linearGradient></defs>`; st = `url(#${g})`; }
      out.push(`${defs}<rect x="1.75" y="1.75" width="32.5" height="32.5" rx="9.5" fill="none" stroke="${st}" stroke-width="3.5"/><circle cx="18" cy="18" r="7.4" fill="none" stroke="${st}" stroke-width="3.5"/><circle cx="27.3" cy="8.7" r="2.3" fill="${mono || '#D62976'}"/>`); }
    { const m = id('fbm');
      out.push(mono ? `<defs><mask id="${m}"><rect width="40" height="40" fill="#fff"/><path d="${FB_F}" fill="#000"/></mask></defs><g transform="scale(.9)"><circle cx="20" cy="20" r="20" fill="${mono}" mask="url(#${m})"/></g>` : `<g transform="scale(.9)"><circle cx="20" cy="20" r="20" fill="#1877F2"/><path d="${FB_F}" fill="#fff"/></g>`); }
    return out.map((s, i) => `<g transform="translate(${f1(x0 + i * (size + gap))},${f1(y0)}) scale(${k})">${s}</g>`).join('');
  }
  function handleMarkup(accent) {
    let h = handleUpper ? handle.toUpperCase() : handle;
    // colour-split the handle on capital-letter word boundaries of the original so all-caps fonts stay readable
    const words = handle.replace(/^@/, '').split(/(?=[A-Z])/);
    if (handleUpper && words.length > 1) return '@' + words.map((w, i) => i % 2 ? `<tspan fill="${accent}">${esc(w.toUpperCase())}</tspan>` : esc(w.toUpperCase())).join('');
    return h.startsWith('@') ? `<tspan fill="${accent}">@</tspan>${esc(h.slice(1))}` : esc(h);
  }
  // bg: solid | glass | clear | feature (comic = halftone highlight bar, epic = motif-topped bar)
  function followBar(bg, iconStyle = 'theme', y = H - BAR) {
    const cy = y + BAR / 2; let s = ''; const feature = bg === 'feature';
    const comicFeature = feature && fam === 'comic';
    if (bg === 'solid' || (feature && fam === 'epic')) s += `<rect y="${y}" width="${W}" height="${BAR}" fill="${C.ink}" opacity=".95"/>`;
    if (bg === 'glass') s += `<rect y="${y}" width="${W}" height="${BAR}" fill="${C.ink}" opacity=".62"/>`;
    if (comicFeature) s += `<rect y="${y}" width="${W}" height="${BAR}" fill="${C.hi}"/>` + halftoneBand(y, y + BAR, 'up', 'rgba(13,10,8,.14)', 10, 2.6);
    const lineCol = fam === 'comic' ? (comicFeature ? C.ink : C.hi) : C.metal;
    if (feature && fam === 'epic') s += motif(M0, 0, W, y + 2, C.metal, 12);
    else s += `<rect y="${y}" width="${W}" height="${comicFeature ? 5 : 3}" fill="${lineCol}"/>`;
    const labelCol = fam === 'comic' ? (comicFeature ? C.ink : C.hi) : C.muted;
    s += fam === 'comic'
      ? txt(72, cy + 12, esc(theme.followText || 'FOLLOW'), { size: 34, fill: labelCol, anchor: 'start', ls: 3, sw: comicFeature ? 0 : 5, shadow: comicFeature ? 0 : 3, maxw: 120 })
      : txt(72, cy + 8, esc(theme.followText || 'FOLLOW'), { size: 22, fill: labelCol, anchor: 'start', ls: 7, shadowEpic: false, maxw: 130 });
    const mono = iconStyle === 'brand' ? null : iconStyle === 'paper' ? C.paper : iconStyle === 'ink' ? C.ink : (fam === 'comic' ? (comicFeature ? C.ink : C.hi) : C.metal);
    s += icons(mono, fam === 'comic' ? 206 : 220, cy - 19, 38, 16);
    for (let i = 0; i < 8; i++) s += `<rect x="${400 + i * 40}" y="${cy - (fam === 'comic' ? 2 : .6)}" width="${26 - i * 3}" height="${fam === 'comic' ? 4 : 1.2}" rx="2" fill="${lineCol}" opacity="${.85 - i * .09}"/>`;
    const hm = handleMarkup(fam === 'comic' ? (comicFeature ? C.paper : C.hi) : C.metal);
    s += fam === 'comic'
      ? txt(W - 72, cy + 15, hm, { size: 44, font: fHandle, weight: wHandle, fill: C.paper, anchor: 'end', ls: 1.5, sw: comicFeature ? 7 : 6, shadow: 3, maxw: 760 })
      : txt(W - 72, cy + 11, hm, { size: 32, font: fHandle, weight: wHandle, fill: C.paper, anchor: 'end', ls: .5, shadowEpic: false, maxw: 760 });
    return s;
  }
  const BAR_BGS = ['solid', 'glass', 'clear', 'feature'];
  const ICON_STYLES = ['theme', 'paper', 'brand'];

  // ---------------- series tags ----------------
  const codeSize = (code, base, box) => Math.min(base, box / (code.length * .68));
  const numSize = (num, base) => ({ 1: base, 2: base, 3: base * .78, 4: base * .6 }[String(num).length] || base * .5);
  const ringSize = (name, base, arc) => Math.min(base, arc / (name.length * .66));
  const TAGS = {};
  // comic family
  TAGS.badge = { box: [312, 312], fam: 'comic', fn(s, n) {
    const a = s.accent, t1 = id('ta'), t2 = id('tb'), hp = id('ht'), num = String(n);
    return `<defs><pattern id="${hp}" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(20)"><circle cx="4.5" cy="4.5" r="2.1" fill="${a}" opacity=".28"/></pattern><path id="${t1}" d="M36 150A114 114 0 0 1 264 150"/><path id="${t2}" d="M24 150A126 126 0 0 0 276 150"/></defs>
    <circle cx="156" cy="156" r="142" fill="${C.ink}"/><circle cx="150" cy="150" r="142" fill="${a}" stroke="${C.ink}" stroke-width="7"/>
    <circle cx="150" cy="150" r="100" fill="${C.paper}" stroke="${C.ink}" stroke-width="6"/><circle cx="150" cy="150" r="97" fill="url(#${hp})"/>
    <text font-family="${fDisplay}" font-weight="${wDisplay}" font-size="${f1(ringSize(s.name, 34, 300))}" letter-spacing="1.5" fill="${C.paper}" stroke="${C.ink}" stroke-width="4" paint-order="stroke fill" stroke-linejoin="round"><textPath href="#${t1}" startOffset="50%" text-anchor="middle">${esc(s.name)}</textPath></text>
    <text font-family="${fDisplay}" font-weight="${wDisplay}" font-size="${f1(ringSize(theme.tagFooter || 'MUSINGS OF MAKSUD', 21, 330))}" letter-spacing="2.5" fill="${C.hi}" stroke="${C.ink}" stroke-width="3.5" paint-order="stroke fill" stroke-linejoin="round"><textPath href="#${t2}" startOffset="50%" text-anchor="middle">${esc(theme.tagFooter || 'MUSINGS OF MAKSUD')}</textPath></text>
    ${star(26, 150, 11, C.hi)}${star(274, 150, 11, C.hi)}
    ${txt(150, 112, esc(s.code), { size: codeSize(s.code, 34, 150), fill: C.ink, sw: 0, shadow: 0, ls: 3, comic: true, maxw: 150 })}
    ${txt(150, num.length >= 3 ? 205 : 214, num, { size: numSize(n, 100), font: fNum, weight: wNum, fill: a, sw: 9, shadow: 6, rot: -6, comic: true, maxw: 170 })}`; } };
  TAGS.burst = { box: [310, 310], fam: 'comic', fn(s, n) {
    const r = rng(n + s.code.length * 101), num = String(n);
    const pts = (ro, ri, k = 14, jit = 10) => { let d = ''; for (let i = 0; i < k * 2; i++) { const ang = -Math.PI / 2 + i * Math.PI / k, rr = (i % 2 ? ri : ro) + (r() - .5) * jit; d += `${i ? 'L' : 'M'}${f1(150 + rr * Math.cos(ang))} ${f1(150 + rr * Math.sin(ang))}`; } return d + 'Z'; };
    const outer = pts(146, 104, 14, 14), inner = pts(118, 92, 14, 8);
    return `<path d="${outer}" fill="${C.ink}" transform="translate(6,6)"/><path d="${outer}" fill="${s.accent}" stroke="${C.ink}" stroke-width="6" stroke-linejoin="round"/><path d="${inner}" fill="${C.hi}" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/>
    ${txt(150, 120, esc(s.code), { size: codeSize(s.code, 40, 150), fill: C.ink, sw: 0, shadow: 0, ls: 3, rot: -6, comic: true, maxw: 160 })}
    ${txt(152, num.length >= 3 ? 204 : 212, num, { size: numSize(n, 100), font: fNum, weight: wNum, fill: C.paper, sw: 10, shadow: 6, rot: -6, comic: true, maxw: 180 })}`; } };
  TAGS.caption = { box: [244, 82], fam: 'comic', fn(s, n) {
    const d = 'M8 7L234 3L230 70L4 74Z', label = s.code + n, fs = Math.min(46, 200 / (label.length * .55));
    return `<path d="${d}" fill="${C.ink}" transform="translate(5,4)"/><path d="${d}" fill="${C.hi}" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/>
    ${txt(120, 38 + fs * .38, `<tspan>${esc(s.code)}</tspan><tspan fill="${s.accent}" font-family="${fNum}" font-weight="${wNum}" dx="8">${n}</tspan>`, { size: fs, fill: C.ink, sw: 3.5, shadow: 0, ls: 2, comic: true, maxw: 196 })}`; } };
  TAGS.slant = { box: [224, 68], fam: 'comic', fn(s, n) {
    const d = 'M22 5H214L198 59H6Z', label = s.code + n, fs = Math.min(40, 170 / (label.length * .55));
    return `<path d="${d}" fill="${C.ink}" transform="translate(5,4)"/><path d="${d}" fill="${s.accent}" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/>
    ${txt(110, 32 + fs * .38, `${esc(s.code)}<tspan font-family="${fNum}" font-weight="${wNum}" fill="${C.hi}" dx="7">${n}</tspan>`, { size: fs, fill: C.paper, sw: 6, shadow: 3, ls: 2, comic: true, maxw: 168 })}`; } };
  // epic family
  TAGS.stamp = { box: [300, 300], fam: 'epic', fn(s, n) {
    const a = s.accent, f = id('rf'), t1 = id('ta'), t2 = id('tb'), num = String(n);
    return `<defs><filter id="${f}" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="${n * 7}" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="3.2" result="d"/><feTurbulence type="fractalNoise" baseFrequency=".055" numOctaves="3" seed="${n * 13 + s.code.length}" result="n2"/><feColorMatrix in="n2" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.1 1.95" result="m"/><feComposite in="d" in2="m" operator="in"/></filter>
    <path id="${t1}" d="M43 150A107 107 0 0 1 257 150"/><path id="${t2}" d="M22 150A128 128 0 0 0 278 150"/></defs>
    <g filter="url(#${f})"><circle cx="150" cy="150" r="140" fill="none" stroke="${a}" stroke-width="8"/><circle cx="150" cy="150" r="98" fill="none" stroke="${a}" stroke-width="3"/>
    <text fill="${a}" font-family="${fDisplay}" font-weight="${wDisplay}" font-size="${f1(ringSize(s.name, 22, 270))}" letter-spacing="3"><textPath href="#${t1}" startOffset="50%" text-anchor="middle">${esc(s.name)}</textPath></text>
    <text fill="${a}" font-family="${fDisplay}" font-weight="${wDisplay}" font-size="${f1(ringSize(theme.tagFooter || 'MUSINGS OF MAKSUD', 15, 330))}" letter-spacing="3"><textPath href="#${t2}" startOffset="50%" text-anchor="middle">${esc(theme.tagFooter || 'MUSINGS OF MAKSUD')}</textPath></text>
    ${diamond(25, 150, 9, a)}${diamond(275, 150, 9, a)}
    <text x="150" y="112" text-anchor="middle" fill="${a}" font-family="${fDisplay}" font-weight="${wDisplay}" font-size="${f1(codeSize(s.code, 26, 120))}" letter-spacing="6" data-maxw="130">${esc(s.code)}</text>
    ${lin(104, 124, 196, 124, a, 2.5)}<text x="150" y="${num.length >= 3 ? 196 : 202}" text-anchor="middle" fill="${a}" font-family="${fNum}" font-weight="${wNum}" font-size="${f1(numSize(n, 84))}" style="font-variant-numeric:lining-nums" data-maxw="170">${num}</text>${lin(104, 220, 196, 220, a, 2.5)}</g>`; } };
  TAGS.seal = { box: [300, 300], fam: 'epic', fn(s, n) {
    const a = s.accent, r = rng(n * 3 + 7), num = String(n); let d = '';
    for (let i = 0; i <= 72; i++) { const ang = i / 72 * Math.PI * 2, rr = 132 + Math.sin(i * 1.7) * 4 + (r() - .5) * 6; d += `${i ? 'L' : 'M'}${f1(150 + rr * Math.cos(ang))} ${f1(150 + rr * Math.sin(ang))}`; }
    const g = id('sg');
    return `<defs><radialGradient id="${g}" cx="40%" cy="35%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></radialGradient></defs>
    <path d="${d}Z" fill="${a}"/><path d="${d}Z" fill="url(#${g})"/>
    <circle cx="150" cy="150" r="104" fill="none" stroke="#000" stroke-opacity=".3" stroke-width="5"/><circle cx="150" cy="150" r="100" fill="none" stroke="${C.metal}" stroke-width="2.5"/>
    <text x="150" y="118" text-anchor="middle" fill="${C.paper}" opacity=".92" font-family="${fDisplay}" font-weight="${wDisplay}" font-size="${f1(codeSize(s.code, 28, 130))}" letter-spacing="5" data-maxw="150">${esc(s.code)}</text>
    <text x="150" y="${num.length >= 3 ? 198 : 206}" text-anchor="middle" fill="${C.paper}" font-family="${fNum}" font-weight="${wNum}" font-size="${f1(numSize(n, 80))}" style="font-variant-numeric:lining-nums" data-maxw="170">${num}</text>
    ${lin(110, 228, 190, 228, C.metal, 1.5)}${diamond(150, 228, 7, C.metal)}`; } };
  TAGS.plaque = { box: [240, 80], fam: 'epic', fn(s, n) {
    const label = s.code + n, fs = Math.min(30, 150 / (label.length * .62));
    return `<rect x="4" y="4" width="232" height="72" fill="${C.ink}" stroke="${C.metal}" stroke-width="1.6"/><rect x="10" y="10" width="220" height="60" fill="none" stroke="${C.metal}" stroke-width=".7" opacity=".5"/>
    ${diamond(26, 40, 9, s.accent)}${diamond(214, 40, 9, s.accent)}
    <text x="120" y="${f1(40 + fs * .36)}" text-anchor="middle" fill="${C.metal}" font-family="${fDisplay}" font-weight="${wDisplay}" font-size="${f1(fs)}" letter-spacing="3" data-maxw="166">${esc(s.code)}<tspan font-family="${fNum}" font-weight="${wNum}" style="font-variant-numeric:lining-nums" letter-spacing="1">${n}</tspan></text>`; } };
  TAGS.cartouche = { box: [220, 64], fam: 'epic', fn(s, n) {
    const label = s.code + n, fs = Math.min(26, 150 / (label.length * .62)), a = s.accent;
    return `<path d="M18 4H202L216 32L202 60H18L4 32Z" fill="${C.ink}" stroke="${a}" stroke-width="1.8"/><path d="M22 10H198L209 32L198 54H22L11 32Z" fill="none" stroke="${a}" stroke-width=".7" opacity=".55"/>
    <text x="110" y="${f1(32 + fs * .36)}" text-anchor="middle" fill="${a}" font-family="${fDisplay}" font-weight="${wDisplay}" font-size="${f1(fs)}" letter-spacing="3" data-maxw="164">${esc(s.code)}<tspan font-family="${fNum}" font-weight="${wNum}" style="font-variant-numeric:lining-nums" letter-spacing="1">${n}</tspan></text>`; } };
  const tagStyles = Object.keys(TAGS).filter((k) => TAGS[k].fam === fam);
  const TAG_FOLDERS = { badge: 'Badge_round', burst: 'Burst', caption: 'Caption_box', slant: 'Slant_tag', stamp: 'Stamp_round', seal: 'Wax_seal', plaque: 'Plaque', cartouche: 'Cartouche' };

  // ---------------- layouts ----------------
  // guide = {role: en1|en2|bn|tag|face, label, x,y,w,h, align, ink, tag(style), shape}
  const G = (role, label, x, y, w, h, extra = {}) => Object.assign({ role, label, x, y, w, h, align: 'middle' }, extra);
  const cornerTicks = () => [[18, 18, 1], [W - 18, 18, -1]].map(([x, y, sx]) => `<path d="M${x} ${y + 80}V${y}H${x + sx * 80}" fill="none" stroke="${C.ink}" stroke-width="14"/><path d="M${x} ${y + 80}V${y}H${x + sx * 80}" fill="none" stroke="${C.hi}" stroke-width="5"/>`).join('');
  const panelFrame = (B, inset = 18, gutter = true, line = 9) => (gutter ? `<path fill-rule="evenodd" fill="${C.paper}" d="M0 0H${W}V${B}H0Z M${inset} ${inset}V${B - inset}H${W - inset}V${inset}Z"/>` : '') + `<rect x="${inset + line / 2}" y="${inset + line / 2}" width="${W - 2 * inset - line}" height="${B - 2 * inset - line}" fill="none" stroke="${C.ink}" stroke-width="${line}"/>`;
  const frameInkHi = (B, inset = 20) => `<rect x="${inset}" y="${inset}" width="${W - 2 * inset}" height="${B - 2 * inset}" fill="none" stroke="${C.ink}" stroke-width="12"/><rect x="${inset}" y="${inset}" width="${W - 2 * inset}" height="${B - 2 * inset}" fill="none" stroke="${C.hi}" stroke-width="4"/>` + [[inset, inset], [W - inset, inset], [W - inset, B - inset], [inset, B - inset]].map(([x, y]) => star(x, y, 20, C.hi)).join('');
  const clipTo = (B, inner) => { const c = id('cb'); return `<defs><clipPath id="${c}"><rect width="${W}" height="${B}"/></clipPath></defs><g clip-path="url(#${c})">${inner}</g>`; };
  // epic pieces
  const scrimTop = (h = 380, a = .82) => { const g = id('st'); return `<defs>${grad(g, 'v', [[0, C.ink, a], [1, C.ink, 0]])}</defs><rect width="${W}" height="${h}" fill="url(#${g})"/>`; };
  const scrimBottom = (B, h = 480, a = .95) => { const g = id('sb'); return `<defs>${grad(g, 'v', [[0, C.ink, 0], [.55, C.ink, a * .82], [1, C.ink, a]])}</defs><rect y="${B - h}" width="${W}" height="${h}" fill="url(#${g})"/>`; };
  const scrimDiag = (B) => { const g = id('sd'); return `<defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2=".8"><stop offset="0" stop-color="${C.ink}" stop-opacity=".9"/><stop offset=".55" stop-color="${C.ink}" stop-opacity="0"/></linearGradient></defs><rect width="${W}" height="${B}" fill="url(#${g})"/>`; };
  const sideScrim = (B) => { const g = id('sp'); return `<defs>${grad(g, 'h', [[0, C.ink, .94], [.3, C.ink, .86], [.48, C.ink, 0]])}</defs><rect width="${W}" height="${B}" fill="url(#${g})"/>`; };
  const vignette = () => { const g = id('vg'); return `<defs><radialGradient id="${g}" cx="50%" cy="50%" r="75%"><stop offset=".55" stop-color="${C.ink}" stop-opacity="0"/><stop offset="1" stop-color="${C.ink}" stop-opacity=".85"/></radialGradient></defs><rect width="${W}" height="${H}" fill="url(#${g})"/>`; };
  const frameDouble = (B) => `<rect x="36" y="36" width="${W - 72}" height="${B - 72}" fill="none" stroke="${C.metal}" stroke-width="1.5" opacity=".8"/><rect x="46" y="46" width="${W - 92}" height="${B - 92}" fill="none" stroke="${C.metal}" stroke-width=".8" opacity=".45"/>`;
  const frameThin = (B, i = 28) => `<rect x="${i}" y="${i}" width="${W - 2 * i}" height="${B - 2 * i}" fill="none" stroke="${C.metal}" stroke-width="1" opacity=".75"/>` + [[i, i], [W - i, i], [W - i, B - i], [i, B - i]].map(([x, y]) => dot(x, y, 3.5)).join('');
  const brackets = (B) => { const b = B - 24; return `<g stroke="${C.metal}" stroke-width="3" fill="none"><path d="M24 76V24h52"/><path d="M${W - 76} 24h52v52"/><path d="M${W - 24} ${b - 52}v52h-52"/><path d="M76 ${b}H24v-52"/></g>`; };
  const cropMarks = (B) => { const b = B - 40; return `<g stroke="${C.metal}" stroke-width="2" opacity=".85"><path d="M40 72h26M72 40v26"/><path d="M${W - 40} 72h-26M${W - 72} 40v26"/><path d="M40 ${b - 32}h26M72 ${b}v-26"/><path d="M${W - 40} ${b - 32}h-26M${W - 72} ${b}v-26"/></g>`; };
  const epicBand = (B, h = 210) => { let s = `<rect y="${B - h}" width="${W}" height="${h}" fill="${C.ink}" opacity=".9"/>` + lin(0, B - h, W, B - h); for (let x = 12; x < W; x += 18) s += dot(x, B - h + 18, 2, C.metal, .55); return s; };

  function layouts(bar, acc) {
    const B = bar ? H - BAR : H; const L = {};
    const win = bar ? { x: 432, y: 186, w: 1056, h: 594 } : { x: 400, y: 190, w: 1120, h: 630 };
    const holeD = `M0 0H${W}V${B}H0Z M${win.x} ${win.y}V${win.y + win.h}H${win.x + win.w}V${win.y}Z`;
    const T = 150, Bb = bar ? 866 : 910;
    if (fam === 'comic') {
      L.A_cover = { pieces: {
          halftone_top: halftoneBand(0, 300, 'down'), halftone_bottom: halftoneBand(B - 360, B, 'up'),
          action_lines: clipTo(B, focusLines(11, C.ink, .55, W / 2, B / 2, [640, 760], 170, B / W * 1.05)),
          panel_frame: panelFrame(B), divider: motif(M0, 800, 1120, 262, acc, 18),
          stars: star(920, B - 196, 13, C.hi) + star(960, B - 200, 17, C.hi) + star(1000, B - 196, 13, C.hi) },
        accentPieces: ['divider'],
        guides: [G('en1', 'ENGLISH 1 · eyebrow', 560, 92, 800, 40), G('en2', 'ENGLISH 2 · title', 260, 134, 1400, 110), G('face', 'KEEP FACE CLEAR OF TEXT', 560, 290, 800, B - 540), G('bn', 'BANGLA', 260, B - 170, 1400, 100), G('tag', 'TAG · caption box', 1600, B - 110, 244, 82, { tag: 'caption' })] };
      const capD = 'M58 70L1060 58L1050 290L66 302Z';
      L.B_caption_left = { pieces: {
          action_lines: clipTo(B, focusLines(23, C.ink, .42, 1400, 600, [600, 760], 130, .62)),
          caption_panel: outlined(capD, C.hi, 6, 9), underline: brush(84, 248, 360, 32, acc),
          bottom_panel: `<rect y="${B - 200}" width="${W}" height="200" fill="${C.ink}"/>` + halftoneBand(B - 200, B - 50, 'down', 'rgba(255,255,255,.08)', 14, 6) + zigzag(-10, W + 10, B - 200, C.hi, 10, 26, 8),
          corner_ticks: cornerTicks() },
        accentPieces: ['underline'],
        guides: [G('en1', 'ENGLISH 1 (ink on yellow)', 96, 86, 900, 40, { align: 'start', ink: true }), G('en2', 'ENGLISH 2 (ink on yellow)', 90, 128, 920, 110, { align: 'start', ink: true }), G('tag', 'TAG · badge / burst', 1600, 60, 260, 260, { tag: 'badge', shape: 'circle' }), G('face', 'FACE / CHARACTER ZONE', 1060, 340, 760, B - 580), G('bn', 'BANGLA', 96, B - 150, 1728, 100, { align: 'start' })] };
      L.C_strip = { barStyle: 'clear', pieces: {
          bar_top: `<rect width="${W}" height="${T}" fill="${C.ink}"/>`, bar_bottom: `<rect y="${Bb}" width="${W}" height="${H - Bb}" fill="${C.ink}"/>`,
          halftone_fades: halftoneBand(T, T + 100, 'down', C.ink, 14, 6.5) + halftoneBand(Bb - 100, Bb, 'up', C.ink, 14, 6.5),
          edge_stripes: [T, Bb].map((y) => `<rect y="${y - 4}" width="${W}" height="8" fill="${C.hi}"/><rect y="${y + (y === T ? 4 : -9)}" width="${W}" height="5" fill="${C.ink}"/>`).join(''),
          speed_lines: speedLines(31, 'left', T + 40, Bb - 40, C.paper, .55, [140, 380], 16) + speedLines(37, 'right', T + 40, Bb - 40, C.paper, .55, [140, 380], 16) },
        accentPieces: [],
        guides: [G('en1', 'ENGLISH 1', 560, 24, 800, 34), G('en2', 'ENGLISH 2', 260, 62, 1400, 76), G('face', 'IMAGE STAYS CLEAR', 80, T + 24, W - 160, Bb - T - 48), G('tag', 'TAG · slant tag', 848, Bb - 34, 224, 68, { tag: 'slant' }), G('bn', 'BANGLA', 260, Bb + 40, 1400, bar ? 84 : 120)] };
      const pc = id('pc');
      L.D_sunburst = { pieces: {
          sunburst_fill: `<defs><clipPath id="${pc}"><path clip-rule="evenodd" d="${holeD}"/></clipPath></defs><g clip-path="url(#${pc})">${sunburst(W / 2, win.y + win.h / 2, acc, C.hi, 44)}${halftoneBand(0, B, 'up', C.ink, 18, 5)}</g>`,
          window_frame: `<rect x="${win.x - 8}" y="${win.y - 8}" width="${win.w + 16}" height="${win.h + 16}" fill="none" stroke="${C.paper}" stroke-width="10"/><rect x="${win.x - 2}" y="${win.y - 2}" width="${win.w + 4}" height="${win.h + 4}" fill="none" stroke="${C.ink}" stroke-width="10"/><rect x="${win.x - 17}" y="${win.y - 17}" width="${win.w + 34}" height="${win.h + 34}" fill="none" stroke="${C.ink}" stroke-width="6"/>`,
          text_panels: outlined(`M300 26L1620 20L1614 ${win.y - 34}L306 ${win.y - 28}Z`, C.paper, 5, 7) + outlined(`M300 ${win.y + win.h + 32}L1620 ${win.y + win.h + 28}L1614 ${B - 22}L306 ${B - 18}Z`, C.paper, 5, 7),
          page_border: `<rect x="5" y="5" width="${W - 10}" height="${B - 10}" fill="none" stroke="${C.ink}" stroke-width="10"/>` },
        accentPieces: ['sunburst_fill'],
        guides: [G('en1', 'ENGLISH 1 (ink)', 560, 34, 800, 34, { ink: true }), G('en2', 'ENGLISH 2 (ink)', 330, 70, 1260, win.y - 104, { ink: true }), G('face', `IMAGE ${win.w}×${win.h} at x${win.x} y${win.y}`, win.x, win.y, win.w, win.h), G('tag', 'TAG (side)', 90, win.y + win.h / 2 - 41, 244, 82, { tag: 'caption' }), G('bn', 'BANGLA (ink)', 330, win.y + win.h + 44, 1260, B - win.y - win.h - 76, { ink: true })] };
      L.E_halftone_edge = { pieces: { halftone_top: halftoneBand(0, 250, 'down', C.ink, 15, 7), halftone_bottom: halftoneBand(B - 300, B, 'up', C.ink, 15, 7), frame: frameInkHi(B) },
        accentPieces: [],
        guides: [G('en1', 'ENGLISH 1', 560, 70, 800, 36), G('en2', 'ENGLISH 2', 260, 110, 1400, 96), G('tag', 'TAG · slant tag', 1640, 48, 224, 68, { tag: 'slant' }), G('face', 'FACE ZONE', 460, 240, 1000, B - 440), G('bn', 'BANGLA', 260, B - 150, 1400, 100)] };
      const slash = `M0 0H780L700 ${B}H0Z`, sc = id('sc');
      L.F_slash_left = { pieces: {
          slash_panel: `<path d="${slash}" fill="${C.ink}" opacity=".93"/><defs><clipPath id="${sc}"><path d="${slash}"/></clipPath></defs><g clip-path="url(#${sc})">${halftoneSide(500, 780, 'left', B, 'rgba(255,255,255,.08)', 15, 6.5)}</g>`,
          slash_edge: `<path d="M780 -10L700 ${B + 10}" stroke="${C.ink}" stroke-width="22"/><path d="M780 -10L700 ${B + 10}" stroke="${C.hi}" stroke-width="9"/>`,
          speed_lines: speedLines(41, 'right', 90, B - 90, C.ink, .6, [160, 420], 20), underline: brush(90, 330, 380, 32, acc) },
        accentPieces: ['underline'],
        guides: [G('en1', 'ENGLISH 1', 90, 100, 580, 36, { align: 'start' }), G('en2', 'ENGLISH 2', 90, 142, 580, 176, { align: 'start' }), G('tag', 'TAG', 90, 384, 244, 82, { tag: 'caption' }), G('bn', 'BANGLA (2–3 lines)', 90, B - 300, 580, 220, { align: 'start' }), G('face', 'CHARACTER SIDE', 820, 70, 1040, B - 140)] };
    } else {
      L.A_title_card = { pieces: { scrim_top: scrimTop(360), scrim_bottom: scrimBottom(B, 460), frame_double: frameDouble(B), corner_brackets: brackets(B), divider: motif(M0, 760, 1160, 270, acc, 20), ornament: MOTIFS.dots(900, 1020, B - 196, C.metal, 12) },
        accentPieces: ['divider'],
        guides: [G('en1', 'ENGLISH 1 · eyebrow', 560, 96, 800, 40), G('en2', 'ENGLISH 2 · title', 260, 136, 1400, 104), G('face', 'KEEP FACE CLEAR OF TEXT', 560, 300, 800, B - 560), G('bn', 'BANGLA', 260, B - 178, 1400, 100), G('tag', 'TAG · plaque', 840, B - 77, 240, 80, { tag: 'plaque' })] };
      L.B_case_file_left = { pieces: { scrim_diagonal: scrimDiag(B), crop_marks: cropMarks(B), underline: `<rect x="84" y="262" width="140" height="7" fill="${acc}"/>` + lin(224, 265.5, 900, 265.5, C.metal, 1.2, .7), bottom_band: epicBand(B), band_motif: motif(M0, 84, 520, B - 52, C.metal, 16) },
        accentPieces: ['underline'],
        guides: [G('en1', 'ENGLISH 1', 84, 100, 1000, 40, { align: 'start' }), G('en2', 'ENGLISH 2', 78, 142, 1100, 110, { align: 'start' }), G('tag', 'TAG · stamp / seal', 1600, 60, 260, 260, { tag: 'stamp', shape: 'circle' }), G('face', 'FACE / CHARACTER ZONE', 1000, 330, 820, B - 570), G('bn', 'BANGLA', 84, B - 160, 1750, 90, { align: 'start' })] };
      L.C_letterbox = { barStyle: 'clear', pieces: (() => { const g1 = id('lt'), g2 = id('lb'); return {
          bar_top: `<defs>${grad(g1, 'v', [[0, C.ink, 1], [1, C.ink, 0]])}</defs><rect width="${W}" height="${T}" fill="${C.ink}"/><rect y="${T}" width="${W}" height="70" fill="url(#${g1})"/>`,
          bar_bottom: `<defs>${grad(g2, 'v', [[0, C.ink, 0], [1, C.ink, 1]])}</defs><rect y="${Bb}" width="${W}" height="${H - Bb}" fill="${C.ink}"/><rect y="${Bb - 70}" width="${W}" height="70" fill="url(#${g2})"/>`,
          rules: [T, Bb].map((y) => motif(M0, 64, W - 64, y, C.metal, 20)).join('') }; })(),
        accentPieces: [],
        guides: [G('en1', 'ENGLISH 1', 560, 26, 800, 34), G('en2', 'ENGLISH 2', 260, 62, 1400, 74), G('face', 'IMAGE STAYS CLEAR', 80, T + 30, W - 160, Bb - T - 60), G('tag', 'TAG · cartouche', 850, Bb - 32, 220, 64, { tag: 'cartouche' }), G('bn', 'BANGLA', 260, Bb + 40, 1400, bar ? 84 : 120)] };
      const pg = id('pl');
      L.D_framed_plate = { pieces: {
          plate_fill: `<defs><radialGradient id="${pg}" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#241A13"/><stop offset="1" stop-color="${C.ink}"/></radialGradient></defs><path fill-rule="evenodd" fill="url(#${pg})" d="${holeD}"/>`,
          plate_frame: (() => { const o = 12; let r = `<rect x="${win.x}" y="${win.y}" width="${win.w}" height="${win.h}" fill="none" stroke="${C.metal}" stroke-width="2"/><rect x="${win.x - o}" y="${win.y - o}" width="${win.w + 2 * o}" height="${win.h + 2 * o}" fill="none" stroke="${C.metal}" stroke-width=".8" opacity=".6"/>`;
            r += [[win.x - o, win.y - o], [win.x + win.w + o, win.y - o], [win.x + win.w + o, win.y + win.h + o], [win.x - o, win.y + win.h + o]].map(([a, b]) => diamond(a, b, 10, C.metal)).join('');
            r += `<rect x="24" y="24" width="${W - 48}" height="${B - 48}" fill="none" stroke="${C.metal}" stroke-width=".8" opacity=".55"/>`;
            for (const vx of [(win.x - o) / 2, W - (win.x - o) / 2]) { const ym = win.y + win.h / 2; r += lin(vx, win.y + 40, vx, ym - 22, C.metal, 1, .8) + lin(vx, ym + 22, vx, win.y + win.h - 40, C.metal, 1, .8) + dot(vx, win.y + 40, 3.5) + dot(vx, win.y + win.h - 40, 3.5) + diamond(vx, ym, 12, C.metal); }
            return r; })(),
          plate_motifs: motif(M0, win.x, win.x + win.w, win.y - 36, C.metal, 20) + motif(M0, win.x, win.x + win.w, win.y + win.h + 36, C.metal, 20) },
        accentPieces: [],
        guides: [G('en1', 'ENGLISH 1', 560, 30, 800, 34), G('en2', 'ENGLISH 2', 330, 66, 1260, win.y - 110), G('face', `IMAGE ${win.w}×${win.h} at x${win.x} y${win.y}`, win.x, win.y, win.w, win.h), G('tag', 'TAG (side)', 64, win.y + win.h / 2 - 40, 240, 80, { tag: 'plaque' }), G('bn', 'BANGLA', 330, win.y + win.h + 52, 1260, B - win.y - win.h - 70)] };
      L.E_minimal = { pieces: { scrim_top: scrimTop(300, .72), scrim_bottom: scrimBottom(B, 380, .9), frame_thin: frameThin(B) },
        accentPieces: [],
        guides: [G('en1', 'ENGLISH 1', 560, 70, 800, 36), G('en2', 'ENGLISH 2', 260, 110, 1400, 96), G('tag', 'TAG · cartouche', 1640, 52, 220, 64, { tag: 'cartouche' }), G('face', 'FACE ZONE', 460, 240, 1000, B - 440), G('bn', 'BANGLA', 260, B - 150, 1400, 100)] };
      L.F_side_panel_left = { pieces: { side_scrim: sideScrim(B), side_rule: lin(56, 90, 56, B / 2 - 24, C.metal, 1.2, .85) + lin(56, B / 2 + 24, 56, B - 90, C.metal, 1.2, .85) + dot(56, 90, 4) + dot(56, B - 90, 4) + diamond(56, B / 2, 13, C.metal), underline: `<rect x="90" y="338" width="110" height="5" fill="${acc}"/>` + motif(M0, 210, 640, 340.5, C.metal, 14) },
        accentPieces: ['underline'],
        guides: [G('en1', 'ENGLISH 1', 90, 100, 580, 36, { align: 'start' }), G('en2', 'ENGLISH 2', 90, 142, 580, 176, { align: 'start' }), G('tag', 'TAG', 90, 380, 240, 80, { tag: 'plaque' }), G('bn', 'BANGLA (2–3 lines)', 90, B - 300, 580, 220, { align: 'start' }), G('face', 'CHARACTER SIDE', 820, 70, 1040, B - 140)] };
    }
    // mirrored right-hand variants
    for (const k of Object.keys(L)) if (/_left$/.test(k)) {
      const src = L[k];
      L[k.replace(/_left$/, '_right')] = { barStyle: src.barStyle, accentPieces: src.accentPieces,
        pieces: Object.fromEntries(Object.entries(src.pieces).map(([n, v]) => [n, mirror(v)])),
        guides: src.guides.map((g) => Object.assign({}, g, { x: W - g.x - g.w, align: g.align === 'start' ? 'end' : g.align === 'end' ? 'start' : g.align })) };
    }
    return L;
  }

  function guideSvg(guides) {
    return guides.map((g) => {
      const col = g.role === 'face' ? '#E7C036' : '#36D6E7';
      const box = g.shape === 'circle' ? `<circle cx="${g.x + g.w / 2}" cy="${g.y + g.h / 2}" r="${g.w / 2}" fill="${col}" fill-opacity=".08" stroke="${col}" stroke-width="2" stroke-dasharray="10 7"/>`
        : `<rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" fill="${col}" fill-opacity="${g.role === 'face' ? .06 : .1}" stroke="${col}" stroke-width="2" stroke-dasharray="10 7"/>`;
      const ty = g.shape === 'circle' ? g.y + g.h / 2 + 6 : g.y + Math.min(g.h / 2 + 6, 26), tx = g.shape === 'circle' ? g.x + g.w / 2 : g.x + 10;
      return box + `<text x="${tx}" y="${ty}" text-anchor="${g.shape === 'circle' ? 'middle' : 'start'}" fill="${col}" font-family="Arial, sans-serif" font-weight="700" font-size="17">${esc(g.label)}</text>`;
    }).join('');
  }

  // sample text placed into guide zones (for the approval preview)
  function sampleText(guides, sample, series, n = 1) {
    let s = '';
    for (const g of guides) {
      const ax = g.align === 'start' ? g.x : g.align === 'end' ? g.x + g.w : g.x + g.w / 2;
      const fill = g.ink ? C.ink : null;
      if (g.role === 'en1') { const size = Math.min(g.h * .85, 40); s += fam === 'comic' ? txt(ax, g.y + g.h * .8, esc(sample.en1), { size, fill: fill || C.hi, anchor: g.align, ls: 3, sw: g.ink ? 0 : 5, shadow: g.ink ? 0 : 3, maxw: g.w }) : txt(ax, g.y + g.h * .78, esc(sample.en1), { size: size * .7, fill: fill || C.muted, anchor: g.align, ls: 10, maxw: g.w }); }
      if (g.role === 'en2') { const size = Math.min(g.h * .82, fam === 'comic' ? 104 : 92); s += txt(ax, g.y + Math.min(g.h, size * 1.12) * .86, esc(sample.en2), { size, fill: fill || C.paper, anchor: g.align, ls: fam === 'comic' ? 3 : 6, sw: g.ink ? 3 : size * .13, shadow: g.ink ? 0 : size * .07, maxw: g.w }); }
      if (g.role === 'bn') { const size = Math.min(g.h * .62, 64); const base = `font-family="${fBangla}" font-size="${f1(size)}" text-anchor="${g.align}" data-maxw="${g.w}"`;
        s += (fam === 'comic' && !g.ink ? `<text x="${f1(ax)}" y="${f1(g.y + g.h * .72)}" ${base} fill="${C.paper}" stroke="${C.ink}" stroke-width="7" paint-order="stroke fill" stroke-linejoin="round">${esc(sample.bn)}</text>` : `<text x="${f1(ax)}" y="${f1(g.y + g.h * .72)}" ${base} fill="${fill || C.paper}">${esc(sample.bn)}</text>`); }
      if (g.role === 'tag' && series) { const st = self.tagStyles.includes(g.tag) ? g.tag : self.tagStyles[0]; const T_ = self.TAGS[st]; const [bw, bh] = T_.box; const sc = Math.min(g.w / bw, g.h / bh); s += `<svg x="${f1(g.x + (g.w - bw * sc) / 2)}" y="${f1(g.y + (g.h - bh * sc) / 2)}" width="${f1(bw * sc)}" height="${f1(bh * sc)}" viewBox="0 0 ${bw} ${bh}" overflow="visible">${T_.fn(series, n)}</svg>`; }
    }
    return s;
  }

  // ---------------- standalone lines / ornaments (own boxes) ----------------
  function lines(accents) {
    const Lz = {};
    for (const m of new Set([...motifs, fam === 'comic' ? 'zigzag' : 'dots'])) {
      Lz[`motif_${m}_divider`] = [420, 40, () => motif(m, 10, 410, 20, fam === 'comic' ? C.hi : C.metal, 18)];
      Lz[`motif_${m}_long`] = [1800, 40, () => motif(m, 10, 1790, 20, fam === 'comic' ? C.hi : C.metal, 18)];
      Lz[`motif_${m}_vertical`] = [40, 600, () => `<g transform="translate(20,0) rotate(90)">${motif(m, 10, 590, 0, fam === 'comic' ? C.hi : C.metal, 18)}</g>`];
    }
    for (const [nm, col] of accents) {
      if (fam === 'comic') {
        Lz[`zigzag_${nm}`] = [320, 44, () => zigzag(12, 308, 22, col)];
        Lz[`brush_underline_${nm}`] = [540, 40, () => brush(8, 6, 520, 26, col)];
        Lz[`burst_blank_${nm}`] = [310, 310, () => outlined(burstPath(150, 150, 146, 104, 14, 5), col, 6, 6)];
        Lz[`arrow_${nm}`] = [210, 90, () => outlined('M10 30H130V8L192 40L130 72V50H10Z', col, 5, 6)];
        Lz[`star_${nm}`] = [52, 52, () => star(24, 24, 21, col)];
      } else {
        Lz[`divider_diamond_${nm}`] = [280, 28, () => lin(10, 14, 128, 14) + lin(152, 14, 270, 14) + diamond(140, 14, 14, col)];
        Lz[`underline_${nm}`] = [540, 14, () => `<rect x="4" y="3" width="120" height="7" fill="${col}"/>` + lin(124, 6.5, 536, 6.5, C.metal, 1.2, .7)];
        Lz[`diamond_${nm}`] = [24, 24, () => diamond(12, 12, 14, col)];
      }
    }
    if (fam === 'comic') Object.assign(Lz, {
      stars_trio: [150, 52, () => star(30, 28, 18, C.hi) + star(75, 25, 23, C.hi) + star(120, 28, 18, C.hi)],
      ink_rule_thick: [1800, 18, () => `<rect y="2" width="1800" height="14" fill="${C.ink}"/><rect y="7" width="1800" height="4" fill="${C.hi}"/>`],
      speed_lines_ink: [600, 140, () => speedLines(51, 'left', 10, 130, C.ink, 1, [220, 580], 22)],
      speed_lines_paper: [600, 140, () => speedLines(53, 'left', 10, 130, C.paper, 1, [220, 580], 22)],
      speed_lines_highlight: [600, 140, () => speedLines(57, 'left', 10, 130, C.hi, 1, [220, 580], 22)],
      halftone_strip_ink: [W, 70, () => halftoneBand(0, 70, 'up', C.ink, 14, 6.5)],
      halftone_strip_highlight: [W, 70, () => halftoneBand(0, 70, 'up', C.hi, 14, 6.5)],
      speech_bubble_blank: [400, 300, () => { const d = 'M200 22C305 22 382 75 382 140C382 205 305 252 200 252C178 252 157 250 138 245L70 290L92 226C42 203 18 172 18 140C18 75 95 22 200 22Z'; return outlined(d, C.paper, 6, 6); }],
      thought_bubble_blank: [400, 320, () => { const cl = 'M90 150C50 150 40 100 80 88C70 50 120 30 150 52C170 20 230 20 248 52C280 30 330 50 322 88C365 98 360 150 320 158C330 195 280 215 250 196C230 230 170 230 150 198C115 215 80 190 90 150Z'; return outlined(cl, C.paper, 6, 6) + [[120, 245, 18], [88, 280, 12], [64, 306, 8]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${C.paper}" stroke="${C.ink}" stroke-width="5"/>`).join(''); }],
      caption_box_blank_highlight: [490, 130, () => outlined('M10 12L478 4L470 112L4 120Z', C.hi, 5, 7)],
      caption_box_blank_paper: [490, 130, () => outlined('M10 12L478 4L470 112L4 120Z', C.paper, 5, 7)],
      panel_corner: [90, 90, () => `<path d="M8 82V8H82" fill="none" stroke="${C.ink}" stroke-width="14"/><path d="M8 82V8H82" fill="none" stroke="${C.hi}" stroke-width="5"/>`],
    });
    else Object.assign(Lz, {
      dot_ornament: [140, 30, () => MOTIFS.dots(10, 130, 15, C.metal, 12)],
      rule_thin: [1800, 6, () => lin(0, 3, 1800, 3, C.metal, 1.5)],
      rule_double: [1800, 10, () => lin(0, 2, 1800, 2, C.metal, 1.5) + lin(0, 8, 1800, 8, C.metal, .7, .5)],
      rule_end_dots: [1810, 14, () => lin(9, 7, 1801, 7, C.metal, 1.2) + dot(9, 7, 4.5) + dot(1801, 7, 4.5)],
      rule_fade_both: [900, 6, () => { const g = id('fb'); return `<defs>${grad(g, 'h', [[0, C.metal, 0], [.5, C.metal, .95], [1, C.metal, 0]])}</defs><rect y="2.4" width="900" height="1.2" fill="url(#${g})"/>`; }],
      perforation: [W, 8, () => { let s = ''; for (let x = 12; x < W; x += 18) s += dot(x, 4, 2, C.metal, .7); return s; }],
      corner_bracket: [56, 56, () => `<path d="M2 54V2h52" fill="none" stroke="${C.metal}" stroke-width="3"/>`],
      crop_mark: [40, 40, () => `<path d="M0 32h26M32 0v26" stroke="${C.metal}" stroke-width="2"/>`],
      vertical_rule_diamond: [20, 600, () => lin(10, 6, 10, 276, C.metal, 1.2) + lin(10, 324, 10, 594, C.metal, 1.2) + dot(10, 6, 4) + dot(10, 594, 4) + diamond(10, 300, 13, C.metal)],
    });
    return Lz;
  }

  // ---------------- full-canvas extras ----------------
  function extras(accents) {
    const E = {};
    if (fam === 'comic') {
      Object.assign(E, { action_lines_ink: focusLines(61, C.ink, .9), action_lines_paper: focusLines(62, C.paper, .9), action_lines_highlight: focusLines(63, C.hi, .9),
        speed_lines_left: speedLines(71, 'left', 50, 1030, C.ink, .85), speed_lines_right: speedLines(72, 'right', 50, 1030, C.ink, .85),
        speed_lines_left_paper: speedLines(73, 'left', 50, 1030, C.paper, .8), speed_lines_right_paper: speedLines(74, 'right', 50, 1030, C.paper, .8),
        halftone_top: halftoneBand(0, 300, 'down'), halftone_bottom: halftoneBand(780, 1080, 'up'), halftone_left: halftoneSide(0, 420, 'right'), halftone_right: halftoneSide(1500, 1920, 'left'),
        panel_frame_gutter: panelFrame(H), panel_frame_ink: panelFrame(H, 18, false), frame_ink_highlight_stars: frameInkHi(H), sunburst_dark: sunburst(960, 540, C.ink, '#2A211A') });
      for (const [nm, col] of accents) { E[`action_lines_${nm}`] = focusLines(64 + nm.length, col, .9); E[`sunburst_${nm}`] = sunburst(960, 540, col, C.hi); }
    } else {
      Object.assign(E, { scrim_top: scrimTop(), scrim_bottom: scrimBottom(H), scrim_diagonal_topleft: scrimDiag(H), scrim_diagonal_topright: mirror(scrimDiag(H)), scrim_side_left: sideScrim(H), scrim_side_right: mirror(sideScrim(H)), vignette: vignette(),
        frame_double: frameDouble(H), frame_thin_dotted: frameThin(H), corner_brackets: brackets(H), crop_marks: cropMarks(H) });
      for (const m of motifs) E[`motif_border_${m}`] = motif(m, 40, W - 40, 40, C.metal, 16) + motif(m, 40, W - 40, H - 40, C.metal, 16);
    }
    return E;
  }

  Object.assign(self, { W, H, BAR, fam, C, theme, layouts, guideSvg, sampleText, followBar, BAR_BGS, ICON_STYLES, TAGS, tagStyles, TAG_FOLDERS, lines, extras, icons, motif, MOTIFS,
    // helpers for look plugins (scripts/looks/*.js); see references/look_plugins.md
    h: { id, f1, rng, mirror, esc, lin, diamond, dot, grad, outlined, star, halftoneBand, halftoneSide, focusLines, speedLines, zigzag, brush, burstPath, sunburst, txt, estW, icons, handleMarkup, G, clipTo,
      scrimTop, scrimBottom, scrimDiag, sideScrim, vignette, frameDouble, frameThin, brackets, cropMarks, epicBand, panelFrame, frameInkHi, cornerTicks, codeSize, numSize, ringSize,
      fonts: { fDisplay, fNum, fHandle, fBangla, wDisplay, wNum, wHandle }, motifs, M0, handle } });
  return self;
}

// Apply a look plugin: a module exporting (E) => void that overrides/extends E.
function applyLook(E, plugin) { const r = plugin(E); return r || E; }

module.exports = { makeEngine, applyLook, W, H, BAR };
