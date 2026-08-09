import type { DevClass, MainTreeGroup, StandSoil, Subgroup } from '@scoring'
import type { GeoJsonProperties } from 'geojson'

// Metsäkeskus avoin metsätieto `v1:stand` attribute names + code lists.
// Validated live 2026-08-09 against a Pirkkala GetFeature sample and the
// official koodisto (avoin-metsatieto-wfs-stand-habitat-koodisto-ja-
// tietokantakuvaus.xlsx). All attribute reads go through this module so a
// schema rename touches exactly one file.
export const STAND_FIELDS = {
  mainGroup: 'MAINGROUP', // 1 metsämaa … 8 vesistö
  subgroup: 'SUBGROUP', // 1 kangas, 2 korpi, 3 räme, 4 neva, 5 letto
  fertilityClass: 'FERTILITYCLASS', // kasvupaikkatyyppi 1..8
  soilType: 'SOILTYPE', // 10..40 mineral, 50 rock, 60+ peat, 70/80 organic
  drainageState: 'DRAINAGESTATE', // 1..3 kangas states, 6..9 mire states
  developmentClass: 'DEVELOPMENTCLASS', // string codes: A0 S0 T1 T2 Y1 02 03 04 05 ER
  mainTreeSpecies: 'MAINTREESPECIES', // 1 mänty, 2 kuusi, 3.. deciduous/other
  proportionPine: 'PROPORTIONPINE', // volume shares 0..1, sum ≈ 1
  proportionSpruce: 'PROPORTIONSPRUCE',
  proportionOther: 'PROPORTIONOTHER',
  meanAge: 'MEANAGE', // years
  basalArea: 'BASALAREA', // m²/ha — the M4 canopy/light proxy
  areaHa: 'AREA' // stand area in ha
} as const

/** Semantic view of one stand's properties — the plugin's unit-testable seam. */
export interface StandAttrs {
  isForestLand: boolean | null // MAINGROUP === 1
  devClass: DevClass | null
  subgroup: Subgroup | null
  fertilityClass: number | null
  pineShare: number | null
  spruceShare: number | null
  otherShare: number | null
  mainTreeGroup: MainTreeGroup | null
  meanAgeYears: number | null
  basalAreaM2Ha: number | null
  standSoil: StandSoil | null
  isDrainedPeatland: boolean | null
  areaHa: number | null
}

const DEV_CLASS_MAP: Record<string, DevClass> = {
  A0: 'open', // aukea
  S0: 'open', // siemenpuumetsikkö — ground freshly regenerated
  T1: 'seedling',
  T2: 'seedling',
  Y1: 'seedling', // ylispuustoinen taimikko
  '02': 'young',
  '03': 'middle',
  '04': 'mature',
  '05': 'shelterwood',
  ER: 'unevenAged'
}

// Conifers by MAINTREESPECIES code (koodisto): mänty 1; kuusi 2; muu havupuu 8,
// douglaskuusi 10, kataja 11, kontortamänty 12, lehtikuusi 14, mustakuusi 16,
// pihta 19, sembramänty 22, serbiankuusi 23, havupuu 30.
const OTHER_CONIFERS = new Set([8, 10, 11, 12, 14, 16, 19, 22, 23, 30])

export function readStandAttributes(props: GeoJsonProperties): StandAttrs {
  const p = props ?? {}
  const num = (k: string): number | null =>
    typeof p[k] === 'number' && Number.isFinite(p[k]) ? (p[k] as number) : null
  const str = (k: string): string | null => (typeof p[k] === 'string' ? (p[k] as string) : null)

  const mainGroup = num(STAND_FIELDS.mainGroup)
  const subgroupCode = num(STAND_FIELDS.subgroup)
  const soilType = num(STAND_FIELDS.soilType)
  const drainage = num(STAND_FIELDS.drainageState)
  const devCode = str(STAND_FIELDS.developmentClass)
  const species = num(STAND_FIELDS.mainTreeSpecies)

  return {
    isForestLand: mainGroup === null ? null : mainGroup === 1,
    devClass: devCode !== null ? (DEV_CLASS_MAP[devCode] ?? null) : null,
    subgroup:
      subgroupCode === null
        ? null
        : subgroupCode === 1
          ? 'kangas'
          : subgroupCode === 2
            ? 'korpi'
            : subgroupCode === 3
              ? 'rame'
              : 'openMire', // 4 neva / 5 letto
    fertilityClass: num(STAND_FIELDS.fertilityClass),
    pineShare: num(STAND_FIELDS.proportionPine),
    spruceShare: num(STAND_FIELDS.proportionSpruce),
    otherShare: num(STAND_FIELDS.proportionOther),
    mainTreeGroup:
      species === null
        ? null
        : species === 1
          ? 'pine'
          : species === 2
            ? 'spruce'
            : OTHER_CONIFERS.has(species)
              ? 'otherConifer'
              : 'deciduous',
    meanAgeYears: num(STAND_FIELDS.meanAge),
    basalAreaM2Ha: num(STAND_FIELDS.basalArea),
    standSoil:
      soilType === null
        ? null
        : soilType === 50
          ? 'rock'
          : soilType === 60 || (soilType >= 63 && soilType <= 67) || soilType >= 180
            ? 'peat'
            : soilType === 70 || soilType === 80
              ? 'other'
              : 'mineral', // 10..49 till/sorted mineral classes
    // Drained states (3 ojitettu kangas, 7 ojikko, 8 muuttuma, 9 turvekangas)
    // imply an internal ditch network — an M6 disturbance signal.
    isDrainedPeatland: drainage === null ? null : [3, 7, 8, 9].includes(drainage),
    areaHa: num(STAND_FIELDS.areaHa)
  }
}
