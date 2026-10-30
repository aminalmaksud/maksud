# Vintage design (from Claude Design)

These are the Claude Design source files for the Vintage look. They're for reference only, and the app doesn't load them.
To view them, serve this folder (`python3 -m http.server`) and open the `.dc.html` files. `support.js` is Claude Design's
preview runtime, and it loads React from unpkg.

- `StreamHub Vintage.dc.html`: brand, tokens and contrast checks, the component sheet, and every screen in Parchment and Night
- `VintageJacket.dc.html`: the book-jacket cover for titles without a poster
- `assets/streamhub-vintage-icon.svg`: the sun, play mark and open-book icon. It's the app's `web/public/logo.svg` (this copy carries Claude Design's content-credentials metadata)

## How it's built into the app
The Vintage look is `web/public/style.css`, shared by the Mac and Windows apps (Settings → Look). The Contemporary look
(`streamhub.css`) is unchanged, apart from the welcome screen's new folder option.

| Design | In the app |
|---|---|
| Brand: StreamHub wordmark, "মুসিংস অব মাকসুদ • টিভি" byline, existing icon | Done in the top bar and on the welcome screen. The window title and the Mac app's name stay "Musings of Maksud TV" |
| Parchment and Night tokens, with the AA contrast fixes | Done. Night has its own wood-panel surfaces and candle-gold glow |
| Components: buttons, tabs, chips, pills, menu items, inputs, focus rings | Done, as a restyle of the existing controls |
| Book-jacket cover | Done, with the design's palettes |
| Welcome: three choices, including "Add a folder from this computer" | Done. Each card acts straight away (no separate Continue button) |
| Home, section page, details, downloads | Done (restyled) |
| Episode list with jacket-style episode tiles | Done |
| Section page: season tabs and a "More in…" side panel | Done for series folders that hold Season folders (the tabs show the season you last watched; a Season folder opened directly gets the tabs too). Contemporary gets the same tabs and panel |
| Player: gold pills, seek bar, time tooltip | Done |
| Player menus | Done in the design's Night style for both themes, since the player is always dark |
| Settings as a full page with cards | Done (`#/settings`, the gear is highlighted while it's open). Contemporary has the same page in its own colours |
| Fonts | Bundled (Oswald, Plus Jakarta Sans, Hind Siliguri, Cinzel, Fraunces), so nothing loads from Google Fonts |
| Drifting specks | Kept, and they stop for people who turn on reduced motion |
| Synopsis | Not in the mockups, added in both looks: on a title's page under its name, in the details sheet, and on a card when you hover it. It comes from TMDB, so it needs the free key in Settings; without one the page says how to add it |
