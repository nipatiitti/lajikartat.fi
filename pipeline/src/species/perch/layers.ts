import type { LayerSpec } from '../../kernel/types'

// Logical layers the perch model needs. `resolve` lists candidate collection-name
// substrings matched against the LIVE source schema (rename-proof). MML ids are
// confirmed where noted; water/stream ids get locked from the /collections probe.
// GTK/SYKE/Corine layers carry no typeName yet → skipped until validated (F3 null).
export const PERCH_LAYERS: LayerSpec[] = [
  // F5 — candidate ponds: `jarvi` holds both lakes and small ponds (confirmed).
  { key: 'water', source: 'mml', resolve: ['jarvi'], geometry: 'polygon' },
  // F1 — roads + buildings (confirmed ids).
  { key: 'roads', source: 'mml', resolve: ['tieviiva'], geometry: 'line' },
  { key: 'buildings', source: 'mml', resolve: ['rakennus'], geometry: 'polygon' },
  // F2 — narrow watercourses, the line connectors (confirmed id).
  { key: 'streams', source: 'mml', resolve: ['virtavesikapea'], geometry: 'line' },
  // F3 — catchment (SYKE valuma-aluejako TASO5, the finest ~13 km² local basins,
  // not the coarse 1990 Jako3) + surface soil (GTK 1:200k). Both validated live.
  {
    key: 'catchments',
    source: 'syke',
    resolve: ['HY.ValumaAluejakoTaso5'],
    geometry: 'polygon',
    params: {
      endpoint: 'https://paikkatiedot.ymparisto.fi/geoserver/inspire_hy/wfs',
      typeName: 'inspire_hy:HY.ValumaAluejakoTaso5',
      outputFormat: 'application/json'
    }
  },
  {
    key: 'soil',
    source: 'gtk',
    resolve: ['maapera_200k_maalajit'],
    geometry: 'polygon',
    params: { typeName: 'Rajapinnat_GTK_Maapera_WFS:maapera_200k_maalajit', outputFormat: 'GEOJSON' }
  }
  // Corine land cover (F4 productivity cross-check) deferred until F4 lands.
]
