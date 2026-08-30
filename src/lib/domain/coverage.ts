import type { Intensity, Moment, Perfume, Season } from './types'

/**
 * Fonction n°2 : la grille de couverture saison × moment × intensité.
 *
 * Un parfum n'est placé que si les trois axes sont sourcés. Sinon il part dans
 * `unplaceable` avec le motif : on ne comble pas un trou de données par une
 * valeur par défaut, ce serait une couverture fictive.
 */

export const SEASONS: readonly Season[] = ['printemps', 'ete', 'automne', 'hiver']
export const MOMENTS: readonly Moment[] = ['jour', 'soir']
export const INTENSITIES: readonly Intensity[] = ['discret', 'modere', 'puissant']

export const SEASON_LABELS: Record<Season, string> = {
  printemps: 'Printemps',
  ete: 'Été',
  automne: 'Automne',
  hiver: 'Hiver',
}
export const MOMENT_LABELS: Record<Moment, string> = { jour: 'Jour', soir: 'Soir' }
export const INTENSITY_LABELS: Record<Intensity, string> = {
  discret: 'Discret',
  modere: 'Modéré',
  puissant: 'Puissant',
}

/** À partir de combien de flacons une case est considérée saturée. */
export const SATURATION_MIN = 3

export type CellState = 'vide' | 'couvert' | 'sature'

export interface CoverageCell {
  season: Season
  moment: Moment
  intensity: Intensity
  perfumeIds: string[]
  state: CellState
}

export interface UnplaceablePerfume {
  perfumeId: string
  /** Axes manquants, en clair, pour que l'utilisateur sache quoi compléter. */
  missing: string[]
}

export interface CoverageGrid {
  cells: CoverageCell[]
  empty: CoverageCell[]
  saturated: CoverageCell[]
  unplaceable: UnplaceablePerfume[]
  /** Nombre de flacons effectivement placés (au moins une case). */
  placedCount: number
}

function cellKey(season: Season, moment: Moment, intensity: Intensity): string {
  return `${season}|${moment}|${intensity}`
}

export function buildCoverageGrid(perfumes: readonly Perfume[]): CoverageGrid {
  const cells = new Map<string, CoverageCell>()
  for (const season of SEASONS) {
    for (const moment of MOMENTS) {
      for (const intensity of INTENSITIES) {
        cells.set(cellKey(season, moment, intensity), {
          season,
          moment,
          intensity,
          perfumeIds: [],
          state: 'vide',
        })
      }
    }
  }

  const unplaceable: UnplaceablePerfume[] = []
  let placedCount = 0

  for (const perfume of perfumes) {
    const missing: string[] = []
    if (perfume.seasons.length === 0) missing.push('saison')
    if (perfume.moments.length === 0) missing.push('moment')
    if (perfume.intensity === null) missing.push('intensité')

    if (missing.length > 0) {
      unplaceable.push({ perfumeId: perfume.id, missing })
      continue
    }

    placedCount += 1
    for (const season of perfume.seasons) {
      for (const moment of perfume.moments) {
        const cell = cells.get(cellKey(season, moment, perfume.intensity as Intensity))
        if (cell) cell.perfumeIds.push(perfume.id)
      }
    }
  }

  const all = [...cells.values()]
  for (const cell of all) {
    cell.state =
      cell.perfumeIds.length === 0
        ? 'vide'
        : cell.perfumeIds.length >= SATURATION_MIN
          ? 'sature'
          : 'couvert'
  }

  return {
    cells: all,
    empty: all.filter((c) => c.state === 'vide'),
    saturated: all.filter((c) => c.state === 'sature'),
    unplaceable,
    placedCount,
  }
}

/**
 * Part des cases vides qu'un parfum viendrait remplir, 0–1.
 * Sert de composante « comble un trou » au moteur de recommandation.
 */
export function gapFit(perfume: Perfume, grid: CoverageGrid): number | null {
  if (perfume.seasons.length === 0 || perfume.moments.length === 0 || perfume.intensity === null) {
    return null // non plaçable : on ne devine pas un bénéfice
  }
  const emptyKeys = new Set(grid.empty.map((c) => cellKey(c.season, c.moment, c.intensity)))
  let covered = 0
  let total = 0
  for (const season of perfume.seasons) {
    for (const moment of perfume.moments) {
      total += 1
      if (emptyKeys.has(cellKey(season, moment, perfume.intensity))) covered += 1
    }
  }
  return total === 0 ? null : covered / total
}
