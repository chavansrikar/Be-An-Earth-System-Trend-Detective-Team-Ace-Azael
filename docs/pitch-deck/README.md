# Pitch deck generator

`ATLAS-EARTH-Pitch-Deck.pptx` (one level up) is a 6-slide 16:9 deck built from real
screenshots of the live app.

## Regenerate

1. Capture the screenshots from the live app into `/tmp/opencode/shots/small` as JPEGs at
   1800 px wide (the names the script expects): `hero-globe`, `globe-photo-wide`,
   `globe-nasa-wide`, `trends-result`, `sweep`, `map`, `compare`, `places`, `mobile`.
2. Build:

```bash
npm install pptxgenjs          # not a project dependency; only needed for the deck
SHOTS=/tmp/opencode/shots/small node docs/pitch-deck/build.mjs
```

The script writes `docs/ATLAS-EARTH-Pitch-Deck.pptx`. Fonts are the safe defaults
(Segoe UI / Consolas), so it opens correctly in PowerPoint, Keynote and Google Slides.
