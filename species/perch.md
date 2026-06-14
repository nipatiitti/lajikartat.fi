# Big-Perch Pond Scoring — Implementation Spec

Purpose: rank small/medium Finnish ponds by likelihood of holding **large perch
(Perca fluviatilis, target ≥ ~400 g, ideal ≥ 1 kg)** for shore fishing, using
open geodata. This file defines the scoring model. Other filters (drivability,
no shoreline buildings, distance to parking) are handled elsewhere and double as
the most important biological factor — see Factor 1.

---

## 1. The biology in one paragraph (so the model makes sense)

Big perch are a **population-dynamic outcome, not a water-chemistry property**.
A pond grows giants when its perch population is held at **low density**, so a
few individuals make the ontogenetic switch to fish-eating (piscivory/cannibalism)
and then live long (often 10–15+ yr). Density is held low by either (a) strong
**cannibalism** in perch-dominated systems, or (b) periodic **winterkill** that
thins competitors (especially roach/cyprinids). The system flips to **stunting**
(many tiny perch) when that thinning is removed — most commonly by **size-
selective angling** removing the large cannibals, or by **cyprinid competition**
and **brown/turbid water** that block the piscivory switch. Therefore the ideal
target is: small, isolated, lightly fished, clear-to-moderately-stained,
roughly mesotrophic, with a thinning mechanism present.

Evidence basis: Persson/Claessen/de Roos cannibalistic-giants model; Treasurer
1993 & Wahlström et al. 2000 (cannibalism controls recruitment in small waters);
multi-decade angler-diary study (size-selective fishing → stunting); boreal
water-colour studies (browning lowers perch length-at-age & foraging efficiency;
TP does not compensate for colour); turbidity inhibits piscivory switch; Finnish
angler forums (kalastus.com) converging on the same factors.

---

## 2. Target archetype (quick reference)

| Attribute            | Favourable for big perch                          |
|----------------------|---------------------------------------------------|
| Fishing pressure     | **Very low** (remote, gated/walk-in, unnamed)     |
| Size                 | Small–medium (≈0.5–20 ha; up to ~50 ha "medium")  |
| Isolation            | Closed/headwater basin, few/no in-out streams     |
| Water colour         | Clear to moderately stained (LOW peatland in catchment) |
| Trophic state        | Oligo-meso to meso (intermediate optimum)         |
| Catchment soil       | Mineral / esker (harju) > peatland                |
| Thinning mechanism   | Perch-only cannibalism OR periodic winterkill     |
| Prey base            | Small fish and/or large macroinvertebrates present|

Anti-pattern (down-rank hard): dystrophic peat puddle, heavily browned,
cyprinid-dominated, roadside/popular, or already in any public fishing-spot list.

---

## 3. Scoring factors

Each factor returns a normalised sub-score in **[0,1]** and a **confidence**
flag in {high, med, low}. Final score = weighted sum (see §5). Direction noted
per factor. Where data is unavailable for a pond, return `null` sub-score and
exclude its weight from the denominator (renormalise), AND lower overall
confidence — do not silently treat missing as 0.

> Note on layer names: the MML Maastotietokanta production schema was renewed in
> spring 2025. Treat the collection/attribute names below as indicative and
> resolve them against the live OGC API Features `/collections` listing at
> implementation time rather than hard-coding from this doc.

### F1 — Fishing-pressure / remoteness  ·  weight 0.30  ·  confidence HIGH
**The single strongest factor.** Higher remoteness ⇒ higher sub-score.
Inputs (MML topographic DB + your existing access filters):
- distance from pond shoreline to nearest drivable road (`tieviiva`/road class)
- access type: paved/gravel road < gated forest road (puomi) < trail < none
  (bike/walk-in is *better* here, not worse)
- count of buildings within 100 m of shoreline (`rakennus`) — 0 is best
- distance to nearest town/parking/boat ramp
- **exclusion/penalty if the waterbody name appears in any public fishing
  dataset** (kalapaikka.net listings, stocked-water lists, Järviwiki popular
  lakes). Named + stocked + roadside = stunting risk.
Suggested transform: monotonic increasing in remoteness, saturating (e.g. log of
distance, capped). Combine sub-signals as a min/weighted-mean so one easy access
route dominates (a pond is only as unfished as its easiest entry).

### F2 — Isolation / closed basin  ·  weight 0.15  ·  confidence MED
Isolation supports the cannibal-control regime and limits cyprinid colonisation.
Inputs (MML `virtavesi` streams + topology; cross-check with **SYKE VesiPetoDW
national stream network** and the catchment-division ID from **Järvirajapinta**):
- number of stream segments connecting to the pond polygon (0 = closed basin,
  best; 1 = headwater; ≥2 = through-flow, lower)
- whether the pond is a network headwater (no upstream lakes)
Direction: fewer connections ⇒ higher sub-score.

### F3 — Water colour / humic load  ·  weight 0.20  ·  confidence MED→HIGH
**Inverted folk wisdom: browner = smaller perch.** Lower colour ⇒ higher score.
Preferred input (where it exists): **SYKE surface-water-quality open interface
(VESLA)** — measured water colour (mg Pt/l), Secchi, and the WFD lake *type*
(which encodes a humus class). High confidence where present; sparse for ponds
< ~50 ha. See §4.
Proxy (default, always available): **peatland fraction in the contributing
catchment**.
- catchment: use **SYKE WSFS-Vemala sub-catchments** (200k+ ready-made basins) —
  no DEM watershedding needed; fall back to a fixed buffer (~500 m) only if
  Vemala isn't wired up yet.
- soil/peat: **GTK superficial-deposits WFS** (esker/glaciofluvial, till, peat
  polygons, 1:20k–1:200k) — sharper than MML `suo` alone. Also use MML `suo` /
  Corine peatbog as cross-check. Compute peat% and esker/mineral% of catchment.
- recent disturbance: **Metsäkeskus** ditch-maintenance (kunnostusojitus)
  project layers in the catchment = recent browning spike → extra down-weight
  (note: planned ≠ always realised; treat as a soft negative).
- bonus signal: esker/`harju` / mineral-soil and pine-heath surroundings → clearer.
Direction: high peatland % ⇒ low sub-score (browner); low peatland %, mineral/
esker catchment ⇒ high sub-score. Treat extreme dystrophy as a hard down-rank.

### F4 — Trophic state / productivity  ·  weight 0.10  ·  confidence MED
Intermediate (meso) optimum: too oligotrophic = little food; too eutrophic =
cyprinid takeover + turbidity. Peak the sub-score in the middle.
Preferred input: **SYKE VESLA** total phosphorus / chlorophyll-a, and/or the
WFD ecological-status class, where available. Also: **WSFS-Vemala** gives
modeled nutrient loading per water body by source — a productivity signal even
for unsampled ponds.
Proxy: agricultural / built land fraction in catchment (Corine, over the Vemala
catchment) — rising ag% → eutrophication risk → down past the optimum; pure
forest+little mire → oligo end.
Transform: unimodal (e.g. Gaussian) centred on mesotrophy.

### F5 — Morphometry: size & depth  ·  weight 0.15  ·  confidence MED (size/depth)
Inputs:
- area: MML water polygon, cross-checked with **SYKE Järvirajapinta / VesiPetoDW**
  (computed area + shoreline for all standing waters >1 ha; tiny ponds <1 ha
  still MML-only). Target band 0.5–20 ha (extend to ~50 ha for "medium"). Outside
  band → taper to 0. Small favours the cannibal-giant dynamic but is fragile to
  pressure (interacts with F1).
- depth: **SYKE Järvirajapinta carries maximum depth** for register lakes (and
  the depth-survey dataset has contours where available) — real data, not just
  the rare contour set. Still null for most ponds <1 ha. Where present, reward
  some depth + a deeper hole (refugia, thermal/oxygen structure). Proxy when
  absent: DEM slope of surrounding terrain (steeper banks ⇒ likely deeper
  drop-off reachable from shore) — weak nudge only.
- structure bonus: **VesiPetoDW** island count + shoreline-length-to-area
  (shoreline development) = more littoral structure/cover — small positive.

### F6 — Thinning-mechanism / winterkill potential  ·  weight 0.10  ·  confidence LOW
Episodic oxygen depletion under ice that thins competitors is a *positive* for
big perch, but severe/chronic kill = fishless, so this is ambiguous and weak.
Proxy: small + shallow + closed basin (reuse F2/F5) + NOT strongly through-flowing.
Regional modifier: **SYKE Hydrology API** (ice thickness, water temperature,
ice-cover duration) gives a winter-severity climatology — apply at regional
scale only; it is NOT pond-specific (modeled, ~50 inland ice stations). Implement
as a small bonus when (area small) AND (likely shallow) AND (isolated), nudged by
regional ice duration, capped low. Do not let it override F3 (a winterkill pond
that is also strongly humic is still a small-perch factory).

### F7 — Prey / fish community  ·  weight 0.05 (low, conditional)  ·  confidence LOW→MED where data exists
Sparse but no longer a total blind spot. **Luke Kalahavainnot** (national fish-
observation register: species occurrence, abundance, species ratios, **age
structure**) — also reachable via the **laji.fi / FinBIF keyed API**, which
aggregates fish occurrences — plus SYKE test-fishing (koekalastus) data give real
signal where the pond was surveyed. Age structure is the literal cannibal-giant
fingerprint: few young + old large fish = giant regime; many small same-age fish
= stunting. Score: perch present + prey fish/crayfish or skewed-old age structure
= good; roach/cyprinid-dominated = bad. Coverage on tiny ponds is thin → for
ungauged targets leave null, weight drops out, and surface a "verify on site"
flag rather than guessing. Only let this contribute (weight 0.05) when real data
exists; otherwise null.

### Excluded by design
Temperature/year-class strength (warm summers → strong cohorts → cannibalism →
giants) is real but not spatially actionable per-pond at regional scale — treat
as a regional constant, document, ignore in scoring.

---

## 4. Data sources (verified June 2026 — resolve exact endpoints/params at build)

Geometry & terrain (MML, API key, CC BY 4.0, EPSG:3067 → reproject before Turf):
- **Maastotietokanta — OGC API Features**: water polygons, streams, roads,
  trails, buildings, mire (`suo`) polygons. Use Features (no generalisation) for
  analysis; vector/raster tiles only for rendering. (Schema renewed spring 2025
  — confirm collection names against the live `/collections` listing.)
- **Korkeusmalli 2 m / hillshade**: F5 slope proxy; only needed for catchment
  delineation if NOT using Vemala.

Water quality, catchment & status (SYKE, CC BY 4.0, OData via rajapinnat.ymparisto.fi / syke.fi open web services):
- **VESLA — surface-water-quality open interface** (OData): measured colour,
  Secchi, TP, chl-a, oxygen for lakes/rivers/small waters, 1960s→. F3/F4.
- **Järvirajapinta — lake register** (OData 3.0): identity, physiography and
  regulation for all waters >1 ha — area, shoreline length, **max depth**,
  catchment-division ID. F5 depth/morphometry, F2 catchment ID.
- **VesiPetoDW — Vesistöjen perustietovaranto** (rajapinnat.ymparisto.fi/api/
  vesipetodw): computed morphometry for 200k+ standing waters (area, shoreline,
  island count) + national stream network. F5 structure, F2 connectivity.
- **Hydrology API** (OData): ice thickness, water temperature, ice-cover
  duration, runoff, water level (~5000 sites; ~50 inland ice stations, modeled).
  F6 regional climatology only — not pond-specific.
- **WFD water bodies (vesimuodostumat)**: lake *type* (humus + depth class) and
  ecological/chemical status. Pre-labelled humic/trophic class — but only for
  classified ("significant") bodies. F3/F4.
- **WSFS-Vemala**: 200k+ ready-made stream/lake **sub-catchments** + modeled
  loading per body by source. Use as the catchment layer for F3/F4 (skips DEM
  watershedding). Basic results open; full model behind annual fee.
- **Lake/river depth dataset**: contours where surveyed (F5).
- **Corine Land Cover**: catchment composition (peat/wetland, agriculture,
  forest), computed over the Vemala catchment. F3/F4.

Catchment soil & forestry disturbance:
- **GTK Maaperä / superficial deposits** (open WMS/WFS, 1:20k–1:200k): esker/
  glaciofluvial, till, peat polygons → clear-vs-brown proxy for F3.
- **Metsäkeskus** (open WMS/WCS/WFS + REST; data model mid-reform): ditch-
  maintenance (kunnostusojitus) project layers in catchment → recent-browning
  signal for F3. Caveat: planned ≠ always realised.

Fish (CC BY 4.0):
- **Luke Kalahavainnot — national fish-observation register** (opendata.luke.fi /
  INSPIRE): species occurrence, abundance, species ratios, age structure. F7.
- **laji.fi / FinBIF** (keyed REST API): aggregated species occurrences incl.
  fish — alternative/complement to Kalahavainnot. F7.
- (Stocking registry / istutusrekisteri for the F1 "is it stocked" penalty: no
  open API found — likely a data request.)

Legality layer (NOT a scoring factor — required for the app regardless):
- **kalastusrajoitus.fi** (MMM + ELY): areas outside general fishing rights,
  restriction/closed areas, migratory-fish waters; updated weekdays. NOT
  comprehensive — does not include all private-owner restrictions.
- **eraluvat.fi** (Metsähallitus): state-water permits & restrictions.
- UI must warn: also check the water owner / osakaskunta; there is no single
  unified national source for all local restrictions.
  (Check whether either exposes a documented feature API before relying on it;
  kalastusrajoitus.fi is primarily a map service.)

Confirmed no clean programmatic endpoint (handle accordingly):
- **kalastusrajoitus.fi / eraluvat.fi**: map services, no documented open feature
  API found (possibly an undocumented ArcGIS REST backend). Overlay via their map
  service or request data; do not assume a queryable API.
- **Järviwiki**: MediaWiki service keyed by lake-register ID; no matured open
  feature API — pull the same structured data from Järvirajapinta / VesiPetoDW /
  VESLA instead.
- **Stocking registry (istutusrekisteri)**: no open API — data request.

---

## 5. Composite & output

- Composite = Σ(weightᵢ · sub_scoreᵢ) over non-null factors, weights renormalised
  to the available set.
- Carry a **confidence** alongside the score = function of how many high-weight
  factors had real (non-proxy) data. Surface both in the UI.
- Always emit a **"why" breakdown** (per-factor sub-scores + the dominant
  positives/negatives) so a human can sanity-check — the model is a heuristic
  over noisy proxies, not ground truth.
- Recommended ranking view: sort by composite, but let the user filter by
  minimum confidence so "high score / low confidence" speculative ponds are
  separable from well-evidenced ones.
- For each top candidate, attach: F7 "verify fish community on site" flag, and
  a reminder that big-perch stocks are fragile — favour catch-and-release of the
  largest fish (this is both an ethic and the mechanism that keeps the pond good).

## 6. Sensible v1 cut

Ship with **F1, F2, F3, F5** — all computable over all of Finland from MML
Features + GTK soil + Vemala catchments + Corine, with no per-lake water-quality
lookups. (F3 uses the peat/esker catchment proxy at v1.) Then a **v2 enrichment
pass on the shortlist (top N)** adds the per-lake queries that don't scale
nationally but are cheap on a few hundred candidates: SYKE VESLA colour/TP,
WFD type/status, and Luke Kalahavainnot fish/age data (F4 + F7, plus F3
upgraded from proxy to measured). Overlay the kalastusrajoitus.fi / eraluvat.fi
legality layer at display time and never present a candidate without it.