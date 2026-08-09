# Chanterelle Habitat Scoring — Implementation Spec

Third companion to the perch and brook-salmonid specs. Purpose: rank forest
locations in Pirkanmaa by likelihood of producing **golden chanterelle
(kantarelli / keltavahvero, Cantharellus cibarius)** and **funnel chanterelle
(suppilovahvero, Craterellus / Cantharellus tubaeformis)**, for foraging under
everyman's right.

> Legal/ethics (light, unlike trout): wild mushroom picking is allowed under
> everyman's right without landowner permission, EXCEPT in yards, cultivated
> land, and where restricted in protected areas. Correct identification is the
> picker's own responsibility (C. cibarius and C. tubaeformis are both easy and
> safe, but the app must not imply guaranteed ID). Don't rake/strip moss; leave
> some. Picking removes only fruiting bodies — the mycelium persists — so a spot
> is renewable and site-faithful.

---

## 1. The biology in one paragraph (why the model looks like this)

Chanterelles are ectomycorrhizal fungi living in symbiosis with tree roots, so
"is there a host tree?" is the entry condition — but the host range is broad
(spruce, pine, birch and more), so in Pirkanmaa forest the host is rarely the
limiting factor. Despite the folk name "birch's fungus," lab work shows C.
cibarius readily forms mycorrhiza with spruce and pine (sometimes not birch),
and Finnish inventories found the best yields in **mature MIXED pine–spruce
stands**, not monocultures. The real spatial signal is therefore **site type ×
maturity × moisture × light × edges/disturbance**, tuned differently per species:
kantarelli wants light, mesic (blueberry-type) mixed/mature forest and especially
**worked ground along old forest-road/ditch/path edges**; suppilovahvero wants
**shady, mossy, spruce-dominated** ground and **moist micro-topography —
depressions, hollows, ditch bottoms, shaded/north slopes**. Both are strongly
**site-faithful** (a found spot recurs yearly → occurrence data is highly
predictive), and fruiting is gated by **antecedent warmth + rainfall** (a
temporal factor, separate from location).

Evidence basis: Fennoscandian ECM host/yield reviews (broad host range; mature
mixed > monoculture; autumn precipitation drives fruiting); chanterelle
weather-yield modelling (GDD base 5°C + cumulative 50–100 mm precipitation
weeks before fruiting); Finnish site-type/indicator-plant ecology (blueberry =
mesic heath); Finnish foraging sources & forums (edge/ditch/disturbance signal,
species micro-habitats, site fidelity, seasons).

---

## 2. Combination rule (multiplicative, with hard vetoes)

Like the salmonid model, combine multiplicatively — but chanterelle is a
generalist, so only a few conditions are true vetoes:

    suitability = VETO × geomean(M1..M7 · species_weights) × M8_occurrence × M9_remoteness
    now_score   = suitability × T_timing        # "is it prime today"

**VETO (→0):** no tree cover / fresh clearcut or seedling stand / open treeless
mire / open water / bare rock face / built or sealed / cultivated field. Keep
`suitability` (where) separate from `now_score` (when) so the map is usable
off-season.

---

## 3. Scoring factors (species-tuned)

Sub-scores [0,1] + confidence. Each factor carries two parameter sets:
**[K] = kantarelli**, **[S] = suppilovahvero**.

### M1 — Host trees & mix  ·  near-hard filter  ·  confidence HIGH
Source: Metsäkeskus metsävaratieto tree-species / Luke MS-NFI species volumes.
- [K] any of spruce/pine/birch present; **mixed stand = best**, monoculture
  slightly penalised.
- [S] **spruce present/dominant** required; conifer mix ok; pure deciduous → ~0.

### M2 — Site fertility type (kasvupaikkatyyppi)  ·  strong gradient  ·  confidence HIGH
Source: Metsäkeskus site-type class / MS-NFI fertility. Unimodal peak.
- [K] optimum **mesic heath (tuore kangas / Myrtillus / blueberry type)**;
  good on sub-dry heath (kuivahko) and herb-rich (lehtomainen/lehto) margins;
  poor on barren (kuiva/karukko) and on peat.
- [S] optimum **mesic spruce (tuore kangas)** and herb-rich mossy sites; spruce-
  mire (korpi) margins ok; poor on dry/barren.

### M3 — Stand maturity / development class  ·  strong  ·  confidence HIGH
Source: Metsäkeskus age/development class / MS-NFI age.
- Both: **mature = high**; fresh clearcut/seedling ≈ 0 (VETO overlaps); pole/
  young stands low; mature-mixed best. Over-mature still fine.

### M4 — Canopy / light  ·  moderate  ·  SPECIES-FLIPPED  ·  confidence MED
Source: Metsäkeskus canopy cover/basal area / MS-NFI.
- [K] semi-open / light positive; very dense dark spruce penalised (primary
  season); note it can still fruit there later in autumn.
- [S] shade-tolerant → moderate/closed canopy positive (shady moist spruce).

### M5 — Moisture & micro-topography  ·  strong (esp. [S])  ·  confidence MED
Source: MML DEM (KM2/LiDAR) → slope, aspect, Topographic Wetness Index (TWI).
- [K] moist-but-drained; moderate TWI; in drier/rockier terrain warm **S/W
  slopes** positive; avoid waterlogged.
- [S] **high-TWI microsites — depressions, hollows, ditch bottoms, shaded/N
  slopes, rock-outcrop north sides** strongly positive.

### M6 — Edge & disturbance proximity  ·  VERY strong (both)  ·  confidence HIGH
The top folk signal. Source: MML roads/paths/**ditches (ojat)** + stand-boundary
edges (from Metsäkeskus polygons) + light-thinning operations (Metsäkeskus).
- Proximity to old forest roads, paths, ditch banks, and stand edges = strong
  positive; lightly worked/compacted ground positive. **Distinguish light
  disturbance (good) from fresh heavy clearcut (VETO).** Recent (~5–15 yr)
  thinned stands can be productive.

### M7 — Soil  ·  moderate  ·  confidence MED
Source: GTK superficial deposits.
- Mineral soil (till/moraine, sorted sand) positive; open peat/bog negative
  (except korpi margins for [S]); thin-soil rock context minor ([K] sunny rocky
  pine; [S] moist rock N-sides).

### M8 — Known occurrence / site fidelity  ·  strong where present  ·  confidence HIGH where data exists
Because spots recur yearly, occurrence is unusually predictive. Source:
**laji.fi / FinBIF** + **GBIF** Cantharellus/Craterellus records; **the user's own
logged finds** (build a personal spot layer — highest value of all). Bias:
foragers hide spots, so absence ≠ absence; use as a positive boost only, never a
penalty.

### M9 — Remoteness / picking pressure  ·  mild  ·  confidence HIGH
Distance from towns/parking/popular trails → fresher, un-picked fruiting bodies
on the day. Milder than for fish (renewable resource, mycelium persists), so
small weight. Reuse the perch/salmonid access computation.

### T — Timing overlay (temporal, NOT spatial)  ·  gates `now_score`
Source: **FMI open data** (precipitation + temperature). Combine: accumulated
warmth (GDD base 5°C) + cumulative antecedent precipitation (~50–100 mm over the
preceding weeks) + season window: **[K] ~July–September (peaks late Jul–Aug,
with the blueberry ripening); [S] ~September–snowfall (tolerates light frost).**
Output a 0–1 "prime now" multiplier for a go/no-go-today view; leave the spatial
map intact off-season.

---

## 4. Data sources

Forest structure (the core layers here):
- **Metsäkeskus metsävaratieto** (open WMS/WCS/WFS + REST; data model mid-reform):
  stand-level tree species, age/development class, site fertility type
  (kasvupaikkatyyppi), canopy, soil, operations. Primary for M1–M4, M6. Mostly
  private-forest coverage.
- **Luke MS-NFI (monilähteinen VMI)** raster (~16 m; open, via Luke/Paituli —
  verify current access): tree-species volumes, site fertility, age, canopy —
  national-complete complement covering state/other land where Metsäkeskus is
  thin. M1–M4.

Terrain & ground:
- **MML DEM (KM2 / LiDAR)**: slope, aspect, TWI. M5.
- **MML Maastotietokanta**: roads, paths, **ditches**, stand/forest edges, mire
  (`suo`), rock (`kallio`), springs. M6, vetoes.
- **GTK superficial deposits** (WMS/WFS): soil/mineral-vs-peat. M7.

Occurrence & weather:
- **laji.fi / FinBIF** (keyed API) + **GBIF**: fungal occurrence. M8.
- **FMI open data** (WFS): precipitation + temperature for the T overlay.

Prior art (reference, not a dependency): **Karttaselain** publishes indicative
predictive maps for both species — useful as a sanity check / baseline.

---

## 5. Output

- Emit `suitability` (where) and `now_score` (when) separately, per species, with
  the per-factor breakdown and which veto (if any) fired.
- The **personal logged-spot layer (M8) is the single highest-value input** —
  make logging finds first-class; site fidelity means it compounds every season.
- Carry confidence; occurrence absence must never lower a score (hidden-spot bias).
- Everyman's-right + responsible-ID + leave-some notes on any surfaced spot.

## 6. Sensible v1 cut

Spatial suitability from nationally-complete layers only, per species:
**M1 (host/mix), M2 (site type), M3 (maturity), M4 (canopy)** from Metsäkeskus +
MS-NFI; **M5 (DEM moisture/topography)**; **M6 (MML road/ditch/path/edge
proximity)**; **M7 (GTK soil)** — combined multiplicatively with the vetoes.
Then enrichment: **M8** laji.fi/GBIF + the user's personal spot log, and the
**T** FMI timing overlay for the "go today" view. Reuse the region-by-region
"analyse this view" architecture from the fish apps; the forest raster/stand
layers replace the water layers, everything else (access scoring, remoteness,
confidence handling, personal logging) carries over.