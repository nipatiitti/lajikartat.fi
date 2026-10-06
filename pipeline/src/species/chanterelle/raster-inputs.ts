import { allocGridInputs, type ChanterelleGridInputs } from '@scoring'
import { MVMI, TWI } from '../../kernel/raster/lattice'
import type { RasterContext } from '../../kernel/types'
import { deriveDevClassCode, MVMI_DERIVE, subgroupFromPaatyyppi } from './mvmi-derive'

/** GTK 1:200k surface-soil class attribute. */
const SOIL_CLASS_FIELD = 'PINTAMAALAJI'
const isPeat = (cls: string) => cls.toLowerCase().includes('turve')
const isRock = (cls: string) => /kallio|rakka/.test(cls.toLowerCase())
/** MVMI paatyyppi: 1 kangas, 2 korpi, 3 räme, 4 avosuo. */
const PAATYYPPI_KANGAS = 1
const PAATYYPPI_AVOSUO = 4
/** kasvupaikka 7 = kalliomaa / hietikko. */
const KASVUPAIKKA_ROCK = 7

/** Bands → column inputs. Cells outside forest land (maaluokka ≠ 1) are invalid. */
export function buildGridInputs(ctx: RasterContext): ChanterelleGridInputs {
  const { width, height } = ctx.tile
  const n = width * height
  const g = allocGridInputs(n)

  const need = (key: string) => {
    const b = ctx.band(key)
    if (!b) throw new Error(`raster band "${key}" missing for tile ${ctx.tile.ix},${ctx.tile.iy}`)
    return b
  }
  const ika = need('ika')
  const ppa = need('ppa')
  const cc = need('latvuspeitto')
  const hgt = need('keskipituus')
  const vol = need('tilavuus')
  const manty = need('manty')
  const kuusi = need('kuusi')
  const kasvu = need('kasvupaikka')
  const paat = need('paatyyppi')
  const maaluokka = need('maaluokka')
  const twi = ctx.band('twi')

  const val = (b: ArrayLike<number>, i: number) => {
    const v = b[i]
    return v === MVMI.nodataOutside || v === MVMI.nodataCloud ? NaN : v
  }

  const d = MVMI_DERIVE
  const track = ctx.distanceTo('tracks', d.edgeCapM)
  const ditch = ctx.distanceTo('ditches', d.edgeCapM)
  const edge = ctx.standEdgeDistance(d.edgeCapM)
  const road = ctx.distanceTo('roads', d.carRoadCapM)
  const buildings = ctx.countWithin('buildings', d.buildingsRadiusM)
  const soil = ctx.classCode('soil', SOIL_CLASS_FIELD)
  const soilPeat = soil?.classes.map((c) => (isPeat(c) ? 1 : 0)) ?? null
  const soilRock = soil?.classes.map((c) => (isRock(c) ? 1 : 0)) ?? null

  for (let i = 0; i < n; i++) {
    if (maaluokka[i] !== 1) continue // outside forest land → stays invalid
    g.valid[i] = 1

    const v = val(vol, i)
    const p = val(manty, i)
    const s = val(kuusi, i)
    if (v > 0 && p === p && s === s) {
      // Species volumes are independent kNN estimates and can sum past the
      // total (0,4 % of cells); normalise by whichever is larger so the shares
      // stay a partition and "other" is not zeroed spuriously.
      const total = Math.max(v, p + s)
      const pine = p / total
      const spruce = s / total
      g.pineShare[i] = pine
      g.spruceShare[i] = spruce
      g.otherShare[i] = Math.max(0, 1 - pine - spruce)
    }

    const k = val(kasvu, i)
    g.fertilityClass[i] = k >= 1 && k <= 8 ? k : -1
    const pt = val(paat, i)
    g.subgroupCode[i] = pt === pt ? subgroupFromPaatyyppi(pt) : -1

    const age = val(ika, i)
    g.devClassCode[i] = deriveDevClassCode(age, val(hgt, i), v)
    g.meanAge[i] = age
    g.basalArea[i] = val(ppa, i)
    g.canopyPct[i] = val(cc, i)
    if (twi) g.twi[i] = twi[i] === TWI.nodata ? NaN : twi[i] / d.twiScale

    if (track) g.nearestTrackM[i] = track[i]
    if (ditch) g.nearestDitchM[i] = ditch[i]
    if (edge) g.nearestStandEdgeM[i] = edge[i]
    const peatland = pt > PAATYYPPI_KANGAS && pt < PAATYYPPI_AVOSUO
    g.drained[i] = peatland && ditch && ditch[i] <= d.drainedDitchM ? 1 : 0

    // Soil: GTK class where cached, else the MVMI site type as a coarse proxy.
    let peat = NaN
    let rock = NaN
    if (soil && soilPeat && soilRock && soil.codes[i] > 0) {
      peat = soilPeat[soil.codes[i]]
      rock = soilRock[soil.codes[i]]
    } else if (pt === pt) {
      peat = pt > PAATYYPPI_KANGAS ? 1 : 0
      rock = pt === PAATYYPPI_KANGAS && k === KASVUPAIKKA_ROCK ? 1 : 0
    }
    g.peatFraction[i] = peat
    g.rockFraction[i] = rock

    if (road) g.nearestCarRoadM[i] = road[i]
    if (buildings) g.buildingsWithin500m[i] = buildings[i]
  }
  return g
}
