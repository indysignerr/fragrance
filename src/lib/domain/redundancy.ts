import type { Perfume } from './types'
import { compare, type SimilarityBreakdown } from './similarity'

/**
 * Fonction n°1 : prévenir le doublon avant l'achat.
 *
 * Les seuils sont calibrés sur la similarité mixte (notes + accords +
 * facettes). Ils sont volontairement exposés : c'est un jugement, pas une
 * vérité, et l'interface doit toujours montrer le score brut à côté du verdict.
 */
export const REDUNDANCY_THRESHOLDS = {
  /** Au-delà : le flacon n'apporte quasiment rien de neuf. */
  redondant: 0.8,
  /** Entre les deux : recoupement net, mais une vraie différence subsiste. */
  chevauchement: 0.62,
} as const

export type RedundancyVerdict = 'redondant' | 'chevauchement' | 'complementaire'

export function verdictFor(score: number): RedundancyVerdict {
  if (score >= REDUNDANCY_THRESHOLDS.redondant) return 'redondant'
  if (score >= REDUNDANCY_THRESHOLDS.chevauchement) return 'chevauchement'
  return 'complementaire'
}

export interface RedundancyMatch {
  /** Le flacon déjà possédé auquel le candidat est comparé. */
  owned: Perfume
  breakdown: SimilarityBreakdown
  verdict: RedundancyVerdict
}

export interface RedundancyReport {
  candidate: Perfume
  /** Verdict le plus sévère rencontré dans toute la collection. */
  verdict: RedundancyVerdict
  /** Flacon possédé le plus proche. `null` si la collection est vide. */
  closest: RedundancyMatch | null
  /** Tous les flacons au moins en chevauchement, du plus proche au moins proche. */
  matches: RedundancyMatch[]
  comparedCount: number
  /**
   * `true` si au moins un vecteur impliqué a été reconstruit faute de poids
   * sourcés. Le verdict reste affiché, mais comme une estimation.
   */
  uncertain: boolean
}

/**
 * Compare un candidat à l'achat contre une collection.
 *
 * L'ordre des arguments compte dans la ventilation : `onlyA` liste ce que le
 * candidat apporte, `onlyB` ce que le flacon possédé a en propre.
 */
export function analyzeRedundancy(
  candidate: Perfume,
  owned: readonly Perfume[],
): RedundancyReport {
  const matches: RedundancyMatch[] = []
  let closest: RedundancyMatch | null = null
  let uncertain = false

  for (const bottle of owned) {
    if (bottle.id === candidate.id) continue
    const breakdown = compare(candidate, bottle)
    if (breakdown.approximated) uncertain = true
    const match: RedundancyMatch = {
      owned: bottle,
      breakdown,
      verdict: verdictFor(breakdown.score),
    }
    if (!closest || breakdown.score > closest.breakdown.score) closest = match
    if (match.verdict !== 'complementaire') matches.push(match)
  }

  matches.sort((a, b) => b.breakdown.score - a.breakdown.score)

  return {
    candidate,
    verdict: closest ? verdictFor(closest.breakdown.score) : 'complementaire',
    closest,
    matches,
    comparedCount: owned.filter((b) => b.id !== candidate.id).length,
    uncertain,
  }
}
