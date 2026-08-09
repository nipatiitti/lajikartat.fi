import type { LayerSpec } from '../../kernel/types'

// Logical layers the chanterelle model needs — shared by BOTH variants, so the
// two ingest runs (kantarelli, suppilovahvero) hit identical disk-cache keys and
// run 2 is nearly pure CPU. All ids/codes validated live 2026-08-09 over the
// Pirkkala bbox; MML kohdeluokka codes come straight from fetched features.
export const CHANTERELLE_LAYERS: LayerSpec[] = [
  // M1–M4 + vetoes — Metsäkeskus stand polygons, the candidate layer. Fetched
  // per tile (`tiled`): full Pirkanmaa holds hundreds of thousands of stands.
  {
    key: 'stands',
    source: 'metsakeskus',
    resolve: ['stand'],
    geometry: 'polygon',
    params: { typeName: 'v1:stand', outputFormat: 'application/json', tiled: 'true' }
  },
  // M6 — worked-edge lines, split from two validated MML collections by class.
  // tieviiva: 12141 ajotie/ajopolku (observed), 12312 talvitie, 12313 polku
  // (observed), 12314/12316 kävely- ja pyörätiet (12316 observed). Unmatched
  // codes simply never match — safe to list.
  {
    key: 'tracks',
    source: 'mml',
    resolve: ['tieviiva'],
    geometry: 'line',
    params: { filterField: 'kohdeluokka', filterValues: '12141,12312,12313,12314,12316' }
  },
  // virtavesikapea 36311 = watercourse < 2 m — in managed forest predominantly
  // ditches (632/655 features in the Pirkkala probe).
  {
    key: 'ditches',
    source: 'mml',
    resolve: ['virtavesikapea'],
    geometry: 'line',
    params: { filterField: 'kohdeluokka', filterValues: '36311' }
  },
  // M9 — the car-road network (autotie classes Ia..IIIb) + buildings. Same
  // tieviiva collection as `tracks` → shares the download, different filter.
  {
    key: 'roads',
    source: 'mml',
    resolve: ['tieviiva'],
    geometry: 'line',
    params: { filterField: 'kohdeluokka', filterValues: '12111,12112,12121,12122,12131,12132' }
  },
  { key: 'buildings', source: 'mml', resolve: ['rakennus'], geometry: 'polygon' },
  // M7 — GTK 1:200k surface soil (validated spec copied from perch/layers.ts).
  {
    key: 'soil',
    source: 'gtk',
    resolve: ['maapera_200k_maalajit'],
    geometry: 'polygon',
    params: { typeName: 'Rajapinnat_GTK_Maapera_WFS:maapera_200k_maalajit', outputFormat: 'GEOJSON' }
  }
]
