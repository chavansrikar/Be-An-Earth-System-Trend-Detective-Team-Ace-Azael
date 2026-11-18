# ATLAS v2: what changed

Branch: `atlas-v2`. Built after the NASA Space Apps 2026 Warangal local event.
`main` is the judged submission and stays frozen until global results are out; merge this branch only after that.

The statistics engine (`api/_stats.ts`) is **unchanged**. v2 only reads the same NASA POWER series that `/api/trends` already returns. There are no new serverless functions (still 11 of Vercel Hobby's 12) and no new API keys.

## 1. New design: "Field Instrument"
A neo-brutalist frame with skeuomorphic details, still in the ATLAS Riso palette (blue `#2B44B8`, cream `#F4EFE4`, pink `#FF4FA3`):
- Hard ink borders and offset shadows on every control. Keys press down when clicked.
- Case files are drawn as manila folders with tabs.
- The significance verdict lands as a rubber stamp (green = significant, amber = weak, maroon = not significant).
- LED dots show live state: the active mode, the data source, and the status line (green = ok, pink = error).
- The run button shows a moving hazard stripe while NASA data loads.
- Faint paper grain over the whole page; a halftone dot grid on the left panel.
- Every style is scoped to `html.v2`, so it works with all `?theme=` options.

## 2. Motion
- On first load, the panel powers on with a staggered rise.
- On each result:
  - the card slides in;
  - the headline number counts up;
  - the chart draws left to right;
  - the stats print one row at a time;
  - the verdict stamp thuds down.
- `prefers-reduced-motion` turns all of it off.

## 3. Better trend chart
- **95% band:** the shaded fan around the trend line comes from the Sen slope's Gilbert (1987) 95% interval.
- **Corrected trend line:** it now uses the median intercept, as in `scipy.stats.theilslopes`. v1 drew it through the mean.
- **Change point:** when Pettitt's test finds a significant change point, a pink "shift YEAR" marker appears, with the before and after means drawn as two flat lines.

## 4. Deep Read (new science, `src/deepread.ts`)
A new panel under the chart with four views of the same record:

| View | What it shows | Method |
|---|---|---|
| Stripes | One stripe per year, coloured by its anomaly from the period mean | Annual mean minus period mean, diverging blue to pink |
| Seasons | Which calendar months changed most | Sen's slope and Mann–Kendall for each month, with Benjamini–Hochberg FDR across the 12 months. Solid bar = significant, outline = not |
| Then / now | The average year in the first decade against the last decade | Monthly averages; the shaded gap shows the difference. This is not a significance test, and the caption says so |
| Records | The 5 highest and 5 lowest years, and how many fall in the latest decade | Ranking, compared with the number you would expect if there were no trend |

Every view has hover tooltips, arrow-key tab navigation and a plain-language caption built from the numbers.

## 5. Shareable links
- The address bar updates to the current result, for example `?trend=17.385,78.487&name=Hyderabad&kind=point&var=t2m&from=1996&to=2025`.
- Opening that link re-runs the same analysis, which is useful for judges, demos and posts.
- A new **Copy link** button in the result card copies it.

## 6. Mobile
- The result is a bottom sheet with a grip. Tap or swipe it up to expand to 88% of the screen, and down to collapse.
- Keys and tabs are sized for touch.

## Files touched
| File | Change |
|---|---|
| `src/v2.ts` (new) | Motion, share link, deep-link reader, mobile sheet |
| `src/v2.css` (new) | The Field Instrument design layer |
| `src/deepread.ts` (new) | The Deep Read views |
| `src/trends-ui.ts` | Calls `onTrendRendered()` after each result; the chart gains the band, median-intercept Sen line and change-point marker; `openTrendAt()` takes optional years |
| `src/main.ts` | Calls `initV2()`; opens `?trend=` links |
| `index.html` | Chart legend text |
| `V2_CHANGES.md` (new) | This file |
