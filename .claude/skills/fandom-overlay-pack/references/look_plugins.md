# Looks and how to make a new one

A look is the visual language of a pack: the layout shapes, frame style, tag designs and
follow bar. The palette, fonts and motifs change on top of it.

## Built-in looks
| look | where | what it is | suits |
|---|---|---|---|
| `comic` | engine.js | halftone dots, action lines, outlined lettering, starbursts, comic yellow | superheroes, comics, cartoons, anime, playful pop topics |
| `epic` | engine.js | metal hairline frames, soft scrims, rubber stamp, wax seal, plaque | mythology, history, classic fantasy, epics |
| `scifi` | looks/scifi.js | chamfered HUD panels, glow lines, scanlines, hex grids, rulers, reticles | space opera, Dune, cyberpunk, sci-fi games |
| `manuscript` | looks/manuscript.js | torn parchment, hand-inked borders, ribbons, wax seals, burnt edges, compass | Middle-earth, The Witcher, Harry Potter, medieval fantasy |

Set `"look"` in theme.json. A plugin look also needs `"family"`: `comic` for outlined
lettering or `epic` for clean text with a soft shadow.

## When to design a new look
Make one when the fandom has a visual language that none of the four looks captures, and
using one of them would look generic. Some ideas:
- **Egyptian:** lapis and gold, cartouche frames, hieroglyph bands, papyrus.
- **Japanese folklore or samurai:** brush strokes, red hanko seal tags, washi paper, wave crests.
- **Noir or Gotham crime:** hard shadows, venetian-blind light bars, case-file stamps.
- **Art deco:** Gatsby or BioShock style, with sunburst fans, stepped gold frames and geometric borders.
- **Steampunk:** brass plates, rivets, gears, gauges.
- **Cosmic horror:** grime, occult circles, torn edges, sickly greens.
- **Cyberpunk neon:** a `scifi` variant with magenta and cyan, glitch slices and katakana-style labels.

## Plugin interface
Write `<series folder>/<name>.js` and set `"look": "<name>.js"` (the path is relative to theme.json).
Base it on `scripts/looks/scifi.js` or `manuscript.js`; both are complete, working examples.

```js
module.exports = function myLook(E) {
  const { W, H, BAR, C, theme } = E;  // canvas 1920x1080, bar height 84, colours, theme
  const h = E.h;                      // helpers: id, f1, rng, mirror, esc, lin, diamond, dot, grad,
                                      // outlined, star, halftoneBand, focusLines, speedLines, zigzag, brush,
                                      // sunburst, txt, icons, handleMarkup, G (guide), clipTo, scrimTop,
                                      // scrimBottom, scrimDiag, sideScrim, vignette, codeSize, numSize, fonts{...}
  E.layouts = (bar, acc) => { /* return { NAME: { pieces, accentPieces, guides, barStyle? } } */ };
  E.TAGS.myTag = { box: [w, h], fn: (series, n) => '<svg markup>' };
  E.tagStyles = ['myTag', ...];       // exactly 4 styles is the house standard
  Object.assign(E.TAG_FOLDERS, { myTag: 'My_Tag' });
  E.followBar = (bg, iconStyle = 'theme', y = H - BAR) => '...';  // bg: solid|glass|clear|feature
  const baseLines = E.lines; E.lines = (accents) => ({ ...baseLines(accents), extra: [w, h, () => '...'] });
  const baseExtras = E.extras; E.extras = (accents) => ({ ...baseExtras(accents), full_canvas_layer: '...' });
  return E;
};
```

### Rules that keep packs consistent
- **Eight layouts** with the same roles as the built-in looks:
  - a centred title;
  - a title panel, left and right;
  - a letterbox or strip;
  - an image window (16:9, same size and position as the built-in looks so guides match);
  - a minimal one;
  - a side panel, left and right.
  Build the `_left` versions and mirror them: copy the mirroring loop from scifi.js.
- **Stay above the follow bar.** `B = bar ? H - BAR : H`. Nothing in a layout may draw below `B`;
  the follow bar owns the bottom 84 px.
- **Guides:**
  - Give every layout `G('en1'…)`, `G('en2'…)`, `G('bn'…)`, `G('tag'…, {tag: '<style>'})` and `G('face'…)`.
  - Mark `ink: true` on any zone that sits on a light panel, so the sample and the user use dark text there.
  - Use `align: 'start'` for left-aligned columns.
- **`accentPieces`** lists the pieces that use the series accent. The build makes one version per accent.
- **Unique ids.** Use `h.id()` for every gradient, filter, clipPath or pattern.
- **Text fitting.** Give `txt()` a `maxw`, or add `data-maxw="..."` on raw `<text>`. The renderer
  measures the text and squeezes it to fit, so tags and bars never overflow whatever the font.
- **Numbers** go in the numbers font (`h.fonts.fNum`). Add `style="font-variant-numeric:lining-nums"`
  for serif number fonts.

### Checking a new look
Run `node scripts/build.js <theme> <out> --preview` and look at all three preview images before showing the user. Check:
- that text sits in its zones;
- that nothing covers the face zone;
- that tags read correctly at 1, the middle number and N;
- that the bar has no overlaps.

A failed render usually means broken SVG markup in a piece: unclosed tags or a bad path.

Custom looks live in the series folder, not inside the installed skill. Give the `.js` file to the
user with the pack so it can be reused later, or added to `scripts/looks/` in a future version of the skill.
