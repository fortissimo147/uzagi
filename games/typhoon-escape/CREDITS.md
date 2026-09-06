# Credits and licenses

## Map data

Coastlines and land polygons come from **Natural Earth** (public domain), redistributed as
TopoJSON by **world-atlas**.

- `world-atlas@2.0.2` — ISC License, Copyright 2013-2019 Michael Bostock
- `topojson-client@3.1.0` — ISC License. Build-time only; not shipped.
- `earcut@3.2.3` — ISC License. Polygon triangulation.

The baked result lives in `src/data/geo.js` and is regenerated with `npm run bake:geo`.

```
world-atlas
Copyright 2013-2019 Michael Bostock

Permission to use, copy, modify, and/or distribute this software for any purpose with or
without fee is hereby granted, provided that the above copyright notice and this permission
notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS
SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL
THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY
DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF
CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE
OR PERFORMANCE OF THIS SOFTWARE.
```

## Typhoon names

**Entirely fictional.** The 140 names in `src/rules/names.js` were made up for this game.
They are **not** the official names assigned by the ESCAP/WMO Typhoon Committee, and the
game says so in its own menu.

The original game used the Japan Meteorological Agency's Asian name list. This version does
not, so no attribution to that list is claimed or given.

## Rendering

- `three@0.180` — MIT License.
- No image files. Every visual is generated in code (see `DESIGN.md` §4).

## Original game

This is a re-creation of `lovewcycle.com/games/others/typhoon-escape.html`, moved from a flat
Mercator map to a 3D globe, with Taiwan in place of Japan. The UI is available in
English (default), Japanese and Traditional Chinese; see `DESIGN.md` §7, which also records
which translated terms are sourced and which are unverified.
The gameplay constants are ported from the original; how and why is written up in
`DESIGN.md` §1 and §1b.
