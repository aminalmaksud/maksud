#!/usr/bin/env node
// Usage:
//   node build.js <theme.json> <outDir> --preview   -> approval previews only (fast)
//   node build.js <theme.json> <outDir> --full      -> full transparent-PNG pack + previews + README
const fs = require('fs');
const path = require('path');
const { makeEngine, W, H, BAR } = require('./engine');

function loadPlaywright() {
  const tries = ['playwright', '/opt/node22/lib/node_modules/playwright', '/usr/lib/node_modules/playwright', '/usr/local/lib/node_modules/playwright'];
  for (const t of tries) { try { return require(t); } catch (e) { /* next */ } }
  try { const g = require('child_process').execSync('npm root -g').toString().trim(); return require(path.join(g, 'playwright')); } catch (e) { /* fallthrough */ }
  console.error('Playwright not found. Install with: npm i -g playwright && npx playwright install chromium'); process.exit(2);
}

const [themePath, outDir, modeFlag] = process.argv.slice(2);
if (!themePath || !outDir) { console.error('usage: node build.js theme.json outDir --preview|--full'); process.exit(1); }
const mode = modeFlag === '--full' ? 'full' : 'preview';
const theme = JSON.parse(fs.readFileSync(themePath, 'utf8'));
const tdir = path.dirname(path.resolve(themePath));
const SKILL = path.resolve(__dirname, '..');
let E = makeEngine(theme);
// looks: comic and epic are built in; anything else is a plugin in scripts/looks/<look>.js or a path relative to the theme
if (theme.look && !['comic', 'epic'].includes(theme.look)) {
  const cands = [path.join(__dirname, 'looks', `${theme.look}.js`), path.resolve(tdir, theme.look), path.resolve(tdir, `${theme.look}.js`)];
  const lp = cands.find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
  if (!lp) { console.error('Look plugin not found:', theme.look, '(looked in', cands.join(', '), ')'); process.exit(4); }
  E = require('./engine').applyLook(E, require(lp));
}
const S = 2; // render scale: 1920x1080 design -> 3840x2160 files
const count = theme.count || 100;
const PACK = (theme.packName || `MusingsOfMaksud_${theme.slug || 'Fandom'}_Overlay_Pack_16x9`);
const ROOT = path.join(path.resolve(outDir), PACK);

// ---------- fonts ----------
function fontFace(f) {
  if (!f || !f.file) return '';
  const p = path.isAbsolute(f.file) ? f.file : fs.existsSync(path.join(tdir, f.file)) ? path.join(tdir, f.file) : path.join(SKILL, f.file);
  if (!fs.existsSync(p)) { console.error('Missing font file:', p); process.exit(3); }
  const ext = path.extname(p).slice(1).toLowerCase(); const fmt = ext === 'otf' ? 'opentype' : ext === 'woff2' ? 'woff2' : ext === 'woff' ? 'woff' : 'truetype';
  return `@font-face{font-family:'${f.family}';font-weight:${f.weight || 400};src:url(data:font/${ext};base64,${fs.readFileSync(p).toString('base64')}) format('${fmt}')}`;
}
const fonts = theme.fonts;
if (!fonts.bangla) fonts.bangla = { family: 'Somoyer Srot', file: 'assets/fonts/Somoyer_Srot_Unicode.ttf' };
const seen = new Set(); let css = '';
for (const k of ['display', 'numbers', 'handle', 'bangla']) { const f = fonts[k]; if (!f) continue; const key = f.family + (f.weight || 400); if (seen.has(key)) continue; seen.add(key); css += fontFace(f); }
const warm = [...seen].length ? Object.values(fonts).map((f) => f && `<span style="font-family:'${f.family}';font-weight:${f.weight || 400}">Aa1 অআ</span>`).join('') : '';

// ---------- accents ----------
const accents = []; const accSeen = new Map();
for (const s of theme.series) { if (!accSeen.has(s.accent)) { const nm = (s.accentName || s.folder).replace(/[^A-Za-z0-9]+/g, '_').toLowerCase(); accSeen.set(s.accent, nm); accents.push([nm, s.accent]); } }

// ---------- jobs ----------
const jobs = []; const add = (file, w, h, scale, inner) => jobs.push({ file: path.join(ROOT, file), w, h, scale, inner });
const sampleBg = (() => {
  if (theme.previewImage) { const p = path.isAbsolute(theme.previewImage) ? theme.previewImage : path.join(tdir, theme.previewImage); const ext = path.extname(p).slice(1).toLowerCase().replace('jpg', 'jpeg'); return `<image href="data:image/${ext};base64,${fs.readFileSync(p).toString('base64')}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>`; }
  return `<defs><radialGradient id="bgx" cx="55%" cy="45%" r="70%"><stop offset="0" stop-color="#8a5a4a"/><stop offset="1" stop-color="#1e1410"/></radialGradient></defs><rect width="${W}" height="${H}" fill="url(#bgx)"/><path d="M960 300c80 0 135 62 135 146 0 66-32 118-68 143v38c125 25 223 98 268 216H625c45-118 143-191 268-216v-38c-36-25-68-77-68-143 0-84 55-146 135-146z" fill="#0b0807" opacity=".55"/>`;
})();
const sample = Object.assign({ en1: (theme.series[0].name || 'SERIES'), en2: 'THE TITLE', bn: 'এখানে বাংলা লেখা' }, theme.sample || {});

function previews(dir) {
  const Lr = E.layouts(true, accents[0][1]), Lg = E.layouts(false, accents[accents.length - 1][1]);
  for (const [k, l] of Object.entries(Lr)) add(path.join(dir, 'layouts_sample', `${k}.png`), W, H, .5, sampleBg + Object.values(l.pieces).join('') + E.followBar(l.barStyle || 'solid') + E.sampleText(l.guides, sample, theme.series[0], 1));
  for (const [k, l] of Object.entries(Lg)) add(path.join(dir, 'layouts_guides', `${k}.png`), W, H, .5, sampleBg + Object.values(l.pieces).join('') + E.guideSvg(l.guides));
  // one-image contact sheets (2 columns) for showing in chat
  for (const [nm, L, withText] of [['LAYOUTS_SHEET_sample', E.layouts(true, accents[0][1]), true], ['LAYOUTS_SHEET_guides', E.layouts(false, accents[accents.length - 1][1]), false]]) {
    const keys = Object.keys(L), rows = Math.ceil(keys.length / 2), gw = W + 40, gh = H + 40;
    let sh = `<rect width="${gw * 2}" height="${gh * rows}" fill="#777"/>`;
    keys.forEach((k, i) => { const l = L[k]; sh += `<svg x="${(i % 2) * gw + 20}" y="${Math.floor(i / 2) * gh + 20}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${sampleBg}${Object.values(l.pieces).join('')}${withText ? E.followBar(l.barStyle || 'solid') + E.sampleText(l.guides, sample, theme.series[0], 1) : E.guideSvg(l.guides)}</svg><text x="${(i % 2) * gw + 40}" y="${Math.floor(i / 2) * gh + 80}" font-family="Arial" font-weight="700" font-size="44" fill="#fff" stroke="#000" stroke-width="6" paint-order="stroke">${i + 1}. ${k}</text>`; });
    add(path.join(dir, `${nm}.png`), gw * 2, gh * rows, .35, sh);
  }
  // tag sheet: rows = series, cols = styles x [1, mid, count]
  const nums = [1, Math.max(2, Math.ceil(count / 2)), count]; const cell = 220; let sheet = ''; let r = 0;
  for (const s of theme.series) { let c = 0; for (const st of E.tagStyles) for (const n of nums) { const [bw, bh] = E.TAGS[st].box; const sc = Math.min((cell - 20) / bw, (cell - 20) / bh); sheet += `<svg x="${c * cell + 10 + (cell - 20 - bw * sc) / 2}" y="${r * cell + 10 + (cell - 20 - bh * sc) / 2}" width="${bw * sc}" height="${bh * sc}" viewBox="0 0 ${bw} ${bh}" overflow="visible">${E.TAGS[st].fn(s, n)}</svg>`; c++; } r++; }
  const tw = E.tagStyles.length * 3 * cell, th = theme.series.length * cell;
  add(path.join(dir, 'tags_sample.png'), tw, th, 1, `<rect width="${tw}" height="${th}" fill="#4a3a32"/>` + sheet);
  let bars = ''; let i = 0; for (const bg of E.BAR_BGS) for (const ic of ['theme', 'brand']) { bars += `<g transform="translate(0,${i * 100 - (H - BAR)})">${E.followBar(bg, ic)}</g>`; i++; }
  add(path.join(dir, 'follow_bars_sample.png'), W, i * 100, .6, `<rect width="${W}" height="${i * 100}" fill="#5a4038"/>` + bars);
}

if (mode === 'preview') previews(path.join('00_PREVIEW'));
else {
  previews('00_PREVIEW');
  for (const bar of [true, false]) {
    const sub = bar ? 'with_follow_bar' : 'no_follow_bar';
    accents.forEach(([an, acc], ai) => {
      const L = E.layouts(bar, acc);
      for (const [key, lay] of Object.entries(L)) {
        const dir = path.join('01_Layouts', key, sub);
        const barSvg = bar ? E.followBar(lay.barStyle || 'solid') : '';
        const hasAcc = lay.accentPieces.length > 0;
        if (ai === 0 || hasAcc) add(path.join(dir, `FULL_OVERLAY${hasAcc ? '_' + an : ''}.png`), W, H, S, Object.values(lay.pieces).join('') + barSvg);
        if (ai === 0) add(path.join(dir, 'GUIDE_text_zones.png'), W, H, S, E.guideSvg(lay.guides));
        for (const [pn, svg] of Object.entries(lay.pieces)) { const isAcc = lay.accentPieces.includes(pn); if (!isAcc && ai > 0) continue; add(path.join(dir, 'pieces', `${isAcc ? pn + '_' + an : pn}.png`), W, H, S, svg); }
        if (bar && ai === 0) add(path.join(dir, 'pieces', 'follow_bar.png'), W, H, S, barSvg);
      }
    });
  }
  for (const s of theme.series) for (const st of E.tagStyles) { const [bw, bh] = E.TAGS[st].box; for (let n = 1; n <= count; n++) add(path.join('02_Series_Tags', s.folder, E.TAG_FOLDERS[st], `${s.code}${n}.png`), bw, bh, 2, E.TAGS[st].fn(s, n)); }
  for (const bg of E.BAR_BGS) for (const ic of E.ICON_STYLES) {
    add(path.join('03_Follow_Bar', 'full_canvas_positioned', `follow_bar_${bg}_${ic}_icons.png`), W, H, S, E.followBar(bg, ic));
    add(path.join('03_Follow_Bar', 'strip_only', `follow_bar_${bg}_${ic}_icons.png`), W, BAR, S, `<g transform="translate(0,${-(H - BAR)})">${E.followBar(bg, ic)}</g>`);
  }
  for (const [nm, [w, h, fn]] of Object.entries(E.lines(accents))) add(path.join('04_Lines_and_Ornaments', `${nm}.png`), w, h, 2, fn());
  for (const [nm, svg] of Object.entries(E.extras(accents))) add(path.join('04_Lines_and_Ornaments', 'full_canvas', `${nm}.png`), W, H, S, svg);
  for (const [st, col] of [['theme', E.fam === 'comic' ? E.C.hi : E.C.metal], ['paper', E.C.paper], ['ink', E.C.ink], ['brand', null]])
    ['youtube', 'instagram', 'facebook'].forEach((nm, i) => add(path.join('05_Social_Icons', st, `${nm}.png`), 36, 36, 8, `<g transform="translate(${-i * 50},0)">${E.icons(col, 0, 0, 36, 14)}</g>`));
}

(async () => {
  const { chromium } = loadPlaywright();
  let browser;
  try { browser = await chromium.launch(); } catch (e) { const exe = ['/opt/pw-browsers/chromium', process.env.CHROMIUM_PATH].find((p) => p && fs.existsSync(p)); browser = await chromium.launch(exe ? { executablePath: exe } : {}); }
  const page = await browser.newPage({ viewport: { width: 4000, height: 2400 } });
  await page.setContent(`<style>${css} html,body{margin:0;background:transparent}</style><div style="position:absolute;left:-9999px">${warm}</div><div id="c"></div>`);
  await page.evaluate(() => document.fonts.ready);
  let i = 0;
  for (const j of jobs) {
    fs.mkdirSync(path.dirname(j.file), { recursive: true });
    await page.evaluate(([w, h, sc, inner]) => { document.getElementById('c').innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${w * sc}" height="${h * sc}" viewBox="0 0 ${w} ${h}" style="display:block">${inner}</svg>`;
      // squeeze any text wider than its slot (fonts differ in width, so measure instead of guessing)
      document.querySelectorAll('#c text[data-maxw]').forEach((t) => { const m = +t.dataset.maxw; if (t.getComputedTextLength() > m) { t.setAttribute('textLength', m); t.setAttribute('lengthAdjust', 'spacingAndGlyphs'); } }); }, [j.w, j.h, j.scale, j.inner]);
    await page.locator('#c > svg').screenshot({ path: j.file, omitBackground: !j.file.includes('00_PREVIEW') });
    if (++i % 250 === 0) console.log(i, '/', jobs.length);
  }
  await browser.close();
  if (mode === 'full') fs.writeFileSync(path.join(ROOT, 'README.txt'), readme());
  console.log(`done ${jobs.length} files -> ${ROOT}`);
})();

function readme() {
  const styles = E.tagStyles.map((s) => E.TAG_FOLDERS[s]).join(', ');
  return `${(theme.title || theme.slug).toUpperCase()} - OVERLAY PACK (16:9, ${theme.look || E.fam} look)
All files are transparent PNG.

SIZE
- Canvas 16:9. Full-canvas files are 3840 x 2160 (2x of 1920 x 1080). Scale to fit your
  16:9 canvas and everything lands in place. Guide numbers are for 1920 x 1080.
- Follow bar: bottom 84 px (y 996-1080).

00_PREVIEW              sample posts, guides, tags and bars
01_Layouts              8 layouts, each with_follow_bar / no_follow_bar
  FULL_OVERLAY*.png     whole layout in one layer (one per series accent where it matters)
  GUIDE_text_zones.png  where English 1, English 2, Bangla, tag and face go. Hide before export.
  pieces/               every element as its own positioned layer
02_Series_Tags          1-${count} for ${theme.series.map((s) => `${s.code} (${s.name})`).join(', ')}
                        styles: ${styles}
03_Follow_Bar           ${theme.followText || 'FOLLOW'} + YouTube/Instagram/Facebook + ${theme.handle || '@MusingsofMaksud'}
                        backgrounds: ${E.BAR_BGS.join(', ')} x icons: ${E.ICON_STYLES.join(', ')}
04_Lines_and_Ornaments  dividers, motifs (${(theme.motifs || []).join(', ') || 'default'}), rules, effects; full_canvas/ = canvas-size layers
05_Social_Icons         YouTube, Instagram, Facebook in theme, paper, ink and brand colours

FONTS
  Display: ${fonts.display.family}   Numbers: ${(fonts.numbers || fonts.display).family}   Handle: ${(fonts.handle || fonts.numbers || fonts.display).family}   Bangla: ${fonts.bangla.family}
COLOURS
  ${Object.entries(E.C).map(([k, v]) => `${k} ${v}`).join('  ')}
  Series accents: ${theme.series.map((s) => `${s.code} ${s.accent}`).join('  ')}
MIDJOURNEY
  End prompts with --ar 16:9. For side layouts add "subject on the right/left side of frame".
`;
}
