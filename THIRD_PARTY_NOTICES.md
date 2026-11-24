# Third-party notices (Counter-Strike 2 pages)

Framecheck is an independent fan project. **Counter-Strike, Counter-Strike 2, Steam, and the names of its weapons, skins, maps
and places are trademarks or property of Valve Corporation. Framecheck is not affiliated with, endorsed or sponsored by Valve.**
Item pictures are loaded from Steam's own content servers; the small Counter-Strike 2 icon in the menu is loaded from Steam's
community servers. Nothing from Valve's games is copied into this repository.

## Skin list: ByMykel/CSGO-API

- Source: https://github.com/ByMykel/CSGO-API (skin names, weapon, rarity, float range, wears, Steam picture addresses)
- Used through `scripts/build-cs2-data.mjs`, which writes `src/data/cs2-skins.json`.
- License: MIT, Copyright (c) 2023 ByMykel

## Callout names and schematic maps: sink3x/cs2-server-admin-callouts

- Source: https://github.com/sink3x/cs2-server-admin-callouts (callout positions, Russian names, and the schematic map pictures
  `src/cs2/maps/*.webp`, which the project draws itself from navigation geometry and publishes under MIT).
- Place names come from the awpy project (https://github.com/pnxenopoulos/awpy, MIT), which reads them from Valve's games.
- License: MIT, Copyright (c) 2026 sink3x. The full text is in `src/cs2/LICENSE-callouts.txt`.

## Prices: Skinport

- Source: Skinport's public REST API (https://docs.skinport.com/), `GET /v1/items`, which needs no key; Skinport's documentation invites
  integrating these prices into applications. `scripts/build-cs2-prices.mjs` takes a snapshot of the cheapest current listing of each item
  (US dollars) and writes `src/data/cs2-prices.json`. The page always shows the source and the date of the snapshot.
- Skinport is a trademark of Skinport GmbH; Framecheck is not affiliated with it. The prices are Skinport marketplace prices, not
  Steam Market prices, and can differ from them. Framecheck does not buy or sell items.
- The "Steam Market" button on every card only opens that item's page on Steam's market.

---

MIT License (as published by both projects above):

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files
(the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE
FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
