import { allocGridInputs, type ChanterelleGridInputs } from '@scoring'
import type { RasterContext } from '../../kernel/types'
import { deriveDevClassCode, MVMI_DERIVE, subgroupFromPaatyyppi } from './mvmi-derive'

const OUTSIDE = 32767
const CLOUD = 32766

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
    return v === OUTSIDE || v === CLOUD ? NaN : v
  }

  const track = ctx.distanceTo('tracks', 1000)
  const ditch = ctx.distanceTo('ditches', 1000)
  const edge = ctx.standEdgeDistance(1000)
  const road = ctx.distanceTo('roads', 3000)
  const buildings = ctx.countWithin('buildings', 500)
  const soil = ctx.classCode('soil', 'PINTAMAALAJI')
  const soilPeat = soil ? soil.classes.map((c) => (c.toLowerCase().includes('turve') ? 1 : 0)) : null
  const soilRock = soil
    ? soil.classes.map((c) => {
        const l = c.toLowerCase()
        return l.includes('kallio') || l.includes('rakka') ? 1 : 0
      })
    : null

  for (let i = 0; i < n; i++) {
    if (maaluokka[i] !== 1) continue // outside forest land → stays invalid
    g.valid[i] = 1

    const v = val(vol, i)
    const p = val(manty, i)
    const s = val(kuusi, i)
    if (v > 0 && p === p && s === s) {
      // Species volumes are independent kNN estimates and can sum past the
      // total (0,4 % of Pirkanmaa cells); normalise by whichever is larger so
      // the shares stay a partition and "other" is not zeroed spuriously.
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
    const h = val(hgt, i)
    g.devClassCode[i] = deriveDevClassCode(age, h, v)
    g.meanAge[i] = age
    g.basalArea[i] = val(ppa, i)
    g.canopyPct[i] = val(cc, i)
    if (twi) {
      const t = twi[i]
      g.twi[i] = t === -32768 ? NaN : t / MVMI_DERIVE.twiScale
    }

    if (track) g.nearestTrackM[i] = track[i]
    if (ditch) g.nearestDitchM[i] = ditch[i]
    if (edge) g.nearestStandEdgeM[i] = edge[i]
    g.drained[i] = (pt === 2 || pt === 3) && ditch && ditch[i] <= MVMI_DERIVE.drainedDitchM ? 1 : 0

    let peat = NaN
    let rock = NaN
    if (soil && soilPeat && soilRock && soil.codes[i] > 0) {
      peat = soilPeat[soil.codes[i]]
      rock = soilRock[soil.codes[i]]
    } else if (pt === pt) {
      peat = pt >= 2 ? 1 : 0
      rock = pt === 1 && k === 7 ? 1 : 0
    }
    g.peatFraction[i] = peat
    g.rockFraction[i] = rock

    if (road) g.nearestCarRoadM[i] = road[i]
    if (buildings) g.buildingsWithin500m[i] = buildings[i]
  }
  return g
}
