import type { LayerSpec, RasterLayerSpec } from '../../kernel/types'
import { MVMI_THEMES } from '../../kernel/raster/sources/luke'

// Vector layers the raster chanterelle model rasterises per tile — shared by
// BOTH variants, so the two ingest runs hit identical disk-cache keys and run 2
// is nearly pure CPU. MML kohdeluokka codes validated live 2026-08-09.
export const CHANTERELLE_LAYERS: LayerSpec[] = [
  // M6 — worked-edge lines, split from two validated MML collections by class.
  // tieviiva: 12141 ajotie/ajopolku, 12312 talvitie, 12313 polku, 12314/12316
  // kävely- ja pyörätiet. Unmatched codes simply never match — safe to list.
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
  // M7 — GTK 1:200k surface soil where cached (Pirkanmaa); elsewhere the model
  // falls back to MVMI paatyyppi / kasvupaikka.
  {
    key: 'soil',
    source: 'gtk',
    resolve: ['maapera_200k_maalajit'],
    geometry: 'polygon',
    params: { typeName: 'Rajapinnat_GTK_Maapera_WFS:maapera_200k_maalajit', outputFormat: 'GEOJSON' },
    optional: true
  }
]

// M1–M5 + vetoes — Luke MS-NFI 2023 themes and the Luke TWI, all 16 m.
export const CHANTERELLE_RASTERS: RasterLayerSpec[] = [
  ...MVMI_THEMES.map((theme) => ({ key: theme, source: 'luke' as const, product: 'mvmi' as const, theme })),
  { key: 'twi', source: 'luke', product: 'twi', theme: 'twi' }
]
