# Brook-Salmonid Habitat Scoring — Implementation Spec

Companion to `big-perch-scoring-spec.md`. Purpose: rank small Finnish streams
(and a few cold ponds) by likelihood of holding **resident brown trout —
tammukka / purotaimen (Salmo trutta m. fario)** — and the pond/headwater
salmonid **puronieriä (brook trout, Salvelinus fontinalis)**, for
**catch-and-release discovery** shore fishing.

> READ THIS FIRST — conservation overrides everything. South of latitude
> 64°00′N (all of Pirkanmaa) wild, adipose-fin-intact brown trout are protected
> and MUST be released. Small natural brooks are themselves protected under the
> Water Act. These resident stocks are fragile remnant gene banks. The app finds
> *places*, never recommends harvest of wild trout, defaults to C&R guidance
> (barbless, wet hands, quick release), and should NOT publish precise
> coordinates of wild-trout brooks. Puronieriä is an invasive species — the
> ethic there is reversed (removal often encouraged) — but verify local rules.

---

## 1. The biology in one paragraph (why the model differs from perch)

Big perch was a population-dynamics gamble; brook trout is a **habitat filter**.
Boreal science shows catchment + reach habitat from map data predicts trout
presence well (a map-only catchment model explained ~43% of trout density in the
Swedish Krycklan study). Trout need: cold, well-oxygenated, stable water (ideally
groundwater-fed and shaded; sustained summer temps below ~24°C); clean
gravel/cobble for spawning (glaciofluvial/till substrate, NOT silt — silt buries
and suffocates eggs); non-acidified water (absent below ~pH 5.0 in snowmelt);
perennial flow; and cover (undercuts, boulders, woody debris, pools). Resident
tammukka often persists specifically in isolated headwaters above barriers —
which both marks it as a non-migratory stock and protects it from competitors,
predators and angling. Puronieriä occupies the same cold, spring-fed niche but
tolerates more acidity (to ~pH 4.1–4.5) and lives in cold ponds as well as brooks.

Evidence basis: Krycklan boreal stream study (pH<5 exclusion, glaciofluvial+/fine-
sediment−, map-based catchment model); brown-trout HSI literature (temperature
ceiling ~24°C, optimum ~12–19°C; groundwater seepage for incubation; canopy shade;
cover essential; gravel redds, silt = recruitment failure); Finnish sources on
purotaimen/tammukka habitat and on puronieriä acid tolerance & spring-fed niche;
angler forums (kalastus.com, perhokalastajat.net).

---

## 2. CRITICAL — combination rule (NOT a weighted sum)

Unlike the perch model, combine suitabilities **multiplicatively / by limiting
factor**, because one fatal condition vetoes the site regardless of the rest:

    suitability = geometric_mean(S_filters)   # or min() for the hard filters

Hard-filter factors (S1 thermal, S2 substrate, S3 acidity, S5 flow permanence):
if any is ~0, the site score is ~0. The remaining factors (S6 isolation, S7
cover, S8 occurrence, S9 remoteness) modulate an already-suitable site. Encode
S1/S2/S3/S5 as suitability curves in [0,1] and multiply; apply S6–S9 as
bounded multipliers or a small additive bonus on top. Emit each sub-score so a
human sees *which* factor vetoed a reach.

---

## 3. Target archetype (quick reference)

| Attribute        | Favourable for resident trout                          |
|------------------|--------------------------------------------------------|
| Thermal regime   | Cold, stable; groundwater/spring-fed; shaded; higher elevation |
| Substrate        | Gravel/cobble; glaciofluvial or till; NOT clay/silt    |
| Acidity          | pH ≳ 5.5 (trout); puronieriä tolerates lower           |
| Sediment input   | Low — minimal ditching/erosion in catchment            |
| Flow             | Perennial; moderate gradient; riffle–pool              |
| Isolation        | Headwater above a natural barrier (relict + protected) |
| Cover            | Undercut banks, boulders, woody debris, pools, canopy  |
| Catchment        | Forest/till/esker; low peatland; low agriculture       |

Anti-pattern (veto): acidified peat-fed ditch; silt-choked low-gradient channel;
sun-exposed channel below a lake outlet running warm; a brook that dries/freezes
solid; heavily ditched catchment.

---

## 4. Scoring factors

Sub-scores in [0,1] + confidence {high,med,low}. Null where no data → drops out
of the geometric mean (and lowers confidence). Resolve exact endpoints at build.

### S1 — Thermal regime (cold & stable)  ·  HARD FILTER  ·  confidence MED
Inputs:
- **groundwater**: SYKE/ELY **pohjavesialueet** (groundwater areas) intersecting
  catchment/reach; MML `lähde` (spring) points near the channel → strong positive
  (cold, stable baseflow; preferred spawning/incubation).
- **shade**: riparian forest canopy (Metsäkeskus stand data / MML / Corine) along
  the channel → positive; open/clearcut riparian → negative.
- **elevation / position**: DEM elevation (higher, headwater = cooler); penalise
  short reaches just below a lake outlet (warm epilimnion outflow).
- where available: **SYKE Hydrology API** water-temperature series.
Suitability peaks for cold, shaded, groundwater-influenced reaches; →0 for warm
exposed low-gradient outlets.

### S2 — Substrate / spawning gravel  ·  HARD FILTER  ·  confidence MED
Inputs:
- **GTK superficial deposits** (WFS, 1:20k–1:200k) along channel + catchment:
  glaciofluvial / till → gravel/cobble (positive); clay / fine marine sediment /
  silt → negative (silt buries redds).
- **DEM-derived stream gradient**: moderate gradient → riffles/gravel (positive);
  near-flat → silt deposition (negative); cliff/waterfall-steep → not spawnable.
Direction: gravel/glaciofluvial + moderate gradient ⇒ high; fine sediment/flat ⇒ low.

### S3 — Acidity / buffering  ·  HARD FILTER  ·  confidence MED
Trout absent below ~pH 5.0 (snowmelt); puronieriä tolerates lower (~4.1–4.5).
Inputs:
- **GTK acid sulfate soils 1:250k** (WMS) in catchment → strong negative (mostly
  coastal; minor inland).
- **peatland fraction** in catchment (GTK peat / MML `suo` / Corine) → acidity +
  low buffering + DOC → negative for brown trout (relax for puronieriä).
- **bedrock buffering** (GTK kallioperä: carbonate/mafic = better buffering).
- measured **pH/alkalinity** from SYKE VESLA where the reach was sampled (high
  confidence where present).
Apply species switch: brown trout strict (≥~5.5); puronieriä lenient.

### S4 — Fine-sediment / catchment disturbance  ·  multiplier  ·  confidence MED→HIGH
**Primary input now: SYKE PUROHELMI stream-naturalness class (1–5; 5 = least
altered).** This is a ready-made, ML-modeled composite of exactly the catchment
disturbance that silts spawning gravel — use class 4–5 as a strong positive.
Rarity note: in southern water-management areas only ~1% of small streams are
predicted near-natural, so in Pirkanmaa this class IS the needle. Also pull
PUROHELMI's **benthic-invertebrate alteration %** as an independent quality +
food-base signal (feed into S7 too).
- **COVERAGE CAVEAT — handle nulls carefully:** PUROHELMI omits streams with
  <5% peatland in catchment, catchments <5 ha, and the near-pristine far north.
  A clean mineral/esker brook (often ideal trout water) may have NO estimate.
  Treat null as "unknown → fall back to the inputs below," NEVER as "bad."
Fallback / supporting inputs where PUROHELMI is null:
- **Metsäkeskus** ditch-maintenance (kunnostusojitus) project layers in catchment
  → sediment pulse + browning + acidity → negative (caveat: planned ≠ realised).
- agricultural / erodible land fraction in catchment (Corine over Vemala basin).
Recent upstream ditching is a strong negative for recruitment (silted gravel).

### S5 — Flow permanence & morphology  ·  HARD FILTER  ·  confidence MED
Must be perennial (not dry out / freeze solid) with workable gradient.
Inputs:
- **catchment area / stream order** (SYKE VesiPetoDW national stream network;
  MML `virtavesi`): too tiny → intermittent; headwater-but-spring/mire/lake-fed →
  sustained baseflow (positive). 
- **DEM gradient**: moderate (riffle–pool) positive; flat (silt/warm) or
  waterfall (uninhabitable reach) low.
- baseflow support: upstream lake/mire/groundwater area stabilises summer flow.

### S6 — Barriers / protective isolation  ·  multiplier (positive)  ·  confidence MED
A natural barrier downstream isolates a resident stock: marks it as tammukka
(non-migratory) AND shields it from invasives/predators/angling. Double-edged
(blocks recolonisation → fragile) → treat as a positive prior for a *pure
resident population*, and raise the conservation/fragility flag.
Inputs (primary): **SYKE PUROHELMI culvert-passability model** — 84,362 stream×
road crossings with a 2 m-DEM ML prediction of passability (published where
probability >50%; valid for culverts/rummut, not bridges). A predicted-impassable
culvert downstream = strong protective-isolation signal. Supplement with **SYKE
Vaellusesteet** (migration-barrier service, ArcGIS REST at paikkatieto.ymparisto.fi)
and DEM knickpoints/waterfalls for natural barriers.

### S7 — Cover & riparian structure (+ food base)  ·  multiplier  ·  confidence LOW→MED
Undercut banks, boulders, woody debris, deep pools, canopy. Proxy: riparian
old/mature forest (Metsäkeskus stand age) + channel sinuosity + low-gradient pool
reaches. Add **PUROHELMI benthic-invertebrate intactness** as a food-base/quality
signal (intact reference fauna ⇒ good trout food + clean substrate). Structure
itself is mostly a site-visit check; keep weight small.

### S8 — Known occurrence / colonisation  ·  multiplier (strong where present)  ·  confidence HIGH where data exists
Trout streams are comparatively well surveyed (unlike perch ponds).
Inputs: **electrofishing register (Koekalastusrekisteri, Luke/SYKE Hertta —
verify access)**; **Luke Kalahavainnot** / **laji.fi (FinBIF) keyed API** trout &
char occurrence; proximity to a known trout river system's headwaters raises the
prior. Presence upstream/downstream strongly raises score; confirmed absence
lowers it.

### S9 — Remoteness / low pressure / discretion  ·  multiplier  ·  confidence HIGH
As perch F1 (distance to road/parking, gated forest roads, no buildings,
unpublished). For wild trout this is also a *conservation* control: prefer, and
do not publicise, low-traffic brooks.

### Pond variant — puronieriä (and small-lake char)
For the cold-*pond* finders-keepers case, swap the stream factors for:
cold + sufficient depth (SYKE Järvirajapinta max depth) + spring-fed
(pohjavesialueet / inlet springs) + isolated (no/limited inflow-outflow) +
clear + a stocking history (no open API — heuristic/data request). Puronieriä
relaxes the acidity filter substantially.

---

## 5. Data sources (additions beyond the perch spec)

Most layers are shared with `big-perch-scoring-spec.md` §4 (MML, GTK deposits,
SYKE VESLA/Vemala/registers/hydrology, Metsäkeskus, Corine, Luke/laji.fi).
Salmonid-specific additions:
- **SYKE PUROHELMI — small-stream naturalness & barriers** (CC BY 4.0; download
  package + interface; on avoindata.fi / ckan.ymparisto.fi / Paikkatietoikkuna).
  Three products on Ranta10-derived segments: (a) habitat naturalness class 1–5
  (5 = least altered) → S4 primary; (b) benthic-invertebrate alteration % → S4/S7;
  (c) culvert-passability model for 84,362 road crossings → S6 primary. Coverage
  caveat: omits catchments with <5% peatland, catchments <5 ha, and the far north
  → null ≠ bad (esker/clear brooks may be unmodeled). Segment-level, verify on site.
- **SYKE Vaellusesteet** (migration barriers): ArcGIS REST MapServer at
  paikkatieto.ymparisto.fi (sykemaps/GISAineistot). S6 (natural barriers).
- **SYKE/ELY Pohjavesialueet** (groundwater areas): open dataset (avoindata). S1.
- **MML `lähde` (springs)** from Maastotietokanta. S1.
- **GTK Acid sulfate soils 1:250k** (WMS layer via GTK_Maapera_WMS). S3.
- **GTK Kallioperä** (bedrock) for buffering capacity. S3.
- **SYKE Hydrology API**: stream water temperature / discharge where gauged. S1/S5.
- **Electrofishing register (Koekalastusrekisteri, Luke/SYKE)**: trout occurrence
  — better coverage than perch surveys. S8. (Confirm current access route.)
- Conservation overlays (display + filter, not scoring): **Arvokkaat pienvedet**
  (Water-Act-protected small waters), **Koskiensuojelulailla suojellut vesistöt**
  (law-protected rapids), nature-reserve layers — all SYKE/ckan.ymparisto.fi.
- Legality: kalastusrajoitus.fi / eraluvat.fi as in the perch spec (no clean API).

---

## 6. Output & ethic

- Emit the per-factor breakdown and which hard filter vetoed a reach.
- Carry confidence; separate "high score / low confidence" from evidenced sites.
- Every wild-trout candidate ships with: the protection notice (release S of
  64°N), C&R handling guidance, a Water-Act small-brook reminder, and NO precise
  public coordinates. Puronieriä candidates flag invasive status instead.
- This model is good at finding *suitable habitat*; confirming fish still needs
  the occurrence layer (S8) or a careful, low-impact site visit.

## 7. Sensible v1 cut

Hard-filter habitat suitability from nationally-complete layers only:
**S1 (DEM elevation/gradient + pohjavesialueet + springs), S2 (GTK deposits +
gradient), S3 (peatland + acid-sulfate + bedrock), S5 (stream network +
gradient)**, combined by geometric mean, with **S9 remoteness** and the
conservation overlays applied. **PUROHELMI is already nationally pre-computed, so
fold it into v1 too**: naturalness class (S4) and culvert passability (S6) come
free per segment — but keep them as multipliers that are skipped (not zeroed)
where PUROHELMI is null. Then a shortlist enrichment pass adds **S8**
(electrofishing/occurrence), natural barriers from Vaellusesteet, and measured
**VESLA pH/temperature** — the per-reach queries that don't scale nationally but
are cheap on the top N. Reuse the same region-by-region "analyse this view"
architecture as the perch app.