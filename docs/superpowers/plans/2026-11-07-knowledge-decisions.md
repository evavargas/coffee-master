# Knowledge base decisions (input for Phase 2, Task 6)

Source: the owner's answers in the planning conversation, 2026-11-07. The git tag `pre-v2-knowledge-baseline` (commit `b865187`) holds the state before any change. Nothing in `backend/knowledge/` has been modified yet.

## Global decisions

- Catalog label (Spanish UI): "Recetas sugeridas por Coffee Master".
- Statuses: `validated`, `testing`, `not_recommended`. No `reference` level and no validation date.
- Every recipe currently listed as validated stays `validated`, including the ones without a raw source (base V60 20/300, Hoffmann, Azahar y Durazno, Mild Honey V60 four pours, Base clásica 25/400, Mild Honey 1:16 variant), cold brew, standard espresso and the milk drinks. AeroPress was tried once in a class with a professional on a borrowed AeroPress (the owner has none): keep it `validated` and say so in its source note.
- Grind clicks are orientative **ranges**, always tied to the grinder (Timemore C2S); they vary with roast level and bean. Every recipe also gets a descriptive grind (for example "media-fina") for people with another grinder.
- Water loss in the French press (15 to 20%) is a personal observation with specific coffees, not a general standard. General values: about 12 to 15%, coffee retains about 2 g of water per gram.
- A 500 ml French press holds at most about 430 g of water. Fix the 30 g example in `02` (450 to 480 ml in a press).
- Filter temperature ranges (`02`, `04`) are a starting point by roast level and flavor-profile similarity; each recipe adjusts them.
- Brew method choice depends on the barista's taste and audience: guidance, not a rule. Floral or fruity bright coffees (Geisha / Azahar y Durazno, Fruit Punch, Berry Bloom, similar profiles) work in any method but never with milk (assumed from "correcto": confirm in the diff).
- Mild Honey is **lavado**. It stays an exception to "lavado → V60" because of its sweet notes (caramelo, miel, fresa). Remove the pending "ficha" note and the honey-in-press exception wording.
- "Geisha Café Quindío" and "Azahar y Durazno" are the same coffee, and it is **lavado** (drop "Geisha natural").
- Moka (the method): 10 to 13 clicks, usually 12. `02` must place moka finer than V60 (V60 is 23 to 26 clicks). `13` says "molienda gruesa de moka" by mistake.
- Moka: only the 2-cup aluminum pot stays in the knowledge (20 g, 12 clicks). Remove the 9-cup steel pot and every reference to it.
- Pours are stored as cumulative water (`pour_to_g`); increments are derived. Mild Honey V60 pours were incremental 40, 80, 120, rest, which is cumulative 40, 120, 240, then 320 to 330.
- Several recipes for one coffee and method are variants by flavor goal (sweetness, balance, acidity): add an optional `goal` field.
- French press: two recipe families by variety and notes. Maximum time inside the press is about 4:30 (longer adds acidity or bitterness). The 1 to 3 minute rest happens **after serving, in the cup**. Remove "reposar 5 min más" from Base clásica. Base clásica has no specific coffee.
- AeroPress numbers follow `04` (15 to 17 g, press 20 to 30 s, 85 to 92 °C); align `15` to it.
- Espresso has two views: the standard espresso, and the owner's adaptation to the De'Longhi Dedica with pressurized baskets.
- Remove the Comandante mention. Origami is a pour-over method; its recipe (ratio about 1:13.9) is a standard the owner saw, **not tested** (`testing`).
- Add Villa Dora in French press as `validated` (25 g, about 377 g, 92 °C, 30 to 32 clicks, stir 0:30, skim 3:00, plunge 3:10 to 3:30), "among the best in notes and flavor", similar to Mild Honey.
- Fruit Punch and Going Nuts are both from Finca Santa Rita, Minas Gerais, Brasil.
- Remove the pending entries "Amor Perfecto pre-envasado" and "Espresso con la De'Longhi Dedica (8 a 10 clics)" from `en-prueba.md` (tried on the Dedica, very acidic, the owner disliked it). Keep the equipment fact that the Dedica has pressurized baskets. Do not write a Dedica adaptation (no tested data).
- Mild Honey V60 final water is a range, 320 to 330 g (the 10 g difference changes body slightly, not the notes).
- Geisha / Azahar y Durazno V60 parameter sets stay as variants; variant (b) stays incomplete (no dose or water) until the owner provides them.
- Fruit Punch was tried only as espresso-type on the Dedica and in the moka (both "acidez punzante"), never as a method recipe. Add a note, no recipes by method.
- Kasuya 4:6 in V60 is `validated` (temperature not recorded).
- Berry Bloom V60 large batch (28 g / 476 g) takes a click range of 25 a 27 (Timemore C2S); the 4:10 drawdown with 25 clicks points to the coarser side of the range.
- Villa Dora raspberry is confirmed: update the recipe and drop the pending re-tasting.
- Remove the Fruit Punch V60 first-attempt entry from `en-prueba.md` (the owner did not test Fruit Punch in V60).
- Remove the Amor Perfecto pre-ground negative V60 result from `11-v60.md` and every reference to the pre-ground case (the `14` row, links). The general rule "abandon V60 when the bed clogs with a fixed grind" stays. The four Amor Perfecto coffees in `14` stay.
- Filter coffee freshness: 7 to 14 days after roast is the strongly recommended window; up to about 20 days is still fine; a month or more starts losing quality. Align `01` and `15` (espresso keeps 7 to 21 days).
- Berry Bloom V60 concentrated (1:15) is now `validated`: the retry gave an excellent result (owner: "100/10"). Parameters assumed as planned: 20 g / 300 g, 25 to 26 clicks, 90 to 91 °C, drawdown 2:45 to 3:00 (to confirm in the diff). Replace the note that said the 1:15 version was bitter: the first attempt (24 clicks, 92 to 93 °C) was bitter and the adjusted one is excellent. Remove it from `en-prueba.md`.
- Oat barista milk (Nude and Naveia) stays as data. Assumed removed: "venta de bebidas", "regalo de curso de barista (Extra 3-20)", the age of the moka pot.
- Duplicated facts are consolidated to one canonical place. Instructions addressed to the model inside the knowledge ("decí que están en prueba") move to the system prompt and the `status` field. `12-prensa` is split into recipes and guides (format only; all its recipes stay validated). Cross-file links are removed.

## Recipes provided by the owner (add as validated unless noted)

**Geisha Café Quindío (Azahar y Durazno), 12 people, V60, ratio 1:15** (tested, "muy bueno"): Timemore C2S 23 clicks, 93 °C, four batches, drawdown 3:00 to 3:30, serve at 55 to 60 °C in a preheated pitcher and cups. Water is cumulative: batch 1 is 26 g / 390 g (52 bloom, 234 at 0:45, 390 at 1:30); batches 2 and 3 are 31 g / 465 g each (62, 279, 465); batch 4 is 32 g / 480 g (64, 288, 480). Total 120 g / 1800 g. Scale to zero the scale with the coffee already in the filter. In practice batches 1 and 2 were enough for everyone.

**Mild Honey Café Quindío, V60, four pours** (tested, "muy bueno"): 20 g, 24 to 25 clicks, 88 to 89 °C, cumulative pours 40 (bloom), 120 at 0:30, 240 at 1:00, 320 to 330 at 2:00; final drawdown 3:21. Taste at 55 to 60 °C so the strawberry appears.

**Kasuya 4:6 in V60** ("salió bien"): designed as 20 g / 300 g, pours 60 (0:00), 60 (0:45), 90 (1:15), 90 (1:45), 25 to 26 clicks, drawdown 3:00 to 3:30. The owner also supplied a technique explanation (first 40% in two pours sets the sweetness-acidity axis; last 60% in two or three pours sets intensity and body). Temperature, actual drawdown and coffee used are missing, and coffee-expert must check the explanation against the original method before it is included.

**Fruit Punch 02:** tried only as espresso-type on the Dedica and in the moka, both "acidez punzante"; no method recipe exists.

## Open items

1. V60 drawdown for 600 ml: `11` says 3:45 to 4:00 in the Hoffmann method and 4:00 to 4:30 in "Escalado a 600 ml", and `02` says more than 4 minutes means too fine a grind. Which target, and should the 4-minute rule depend on volume? **Do not change these times or the `02` rule until the owner answers.**
