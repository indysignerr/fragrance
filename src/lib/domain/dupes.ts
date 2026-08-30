import { SOURCE_RELIABILITY, type DupeLink, type Perfume, type Source } from './types'
import { similarity } from './similarity'

/**
 * Fonction n°4 : les correspondances clone / original, avec leur fiabilité.
 *
 * Principe : une attribution non sourcée n'est jamais présentée au même niveau
 * qu'une attribution vérifiée. La confiance déclarée est *plafonnée* par la
 * qualité des sources — on ne peut pas revendiquer 0,9 de confiance sur la foi
 * d'un seul post de forum.
 */

export type DupeTier = 'verifie' | 'probable' | 'rumeur' | 'non-source'

export const TIER_LABELS: Record<DupeTier, string> = {
  verifie: 'Vérifié',
  probable: 'Probable',
  rumeur: 'Rumeur',
  'non-source': 'Non sourcé',
}

/** Ordre d'affichage. Le non-sourcé passe toujours en dernier. */
export const TIER_RANK: Record<DupeTier, number> = {
  verifie: 0,
  probable: 1,
  rumeur: 2,
  'non-source': 3,
}

/**
 * Écart au-delà duquel la similarité calculée contredit franchement
 * l'attribution revendiquée.
 */
export const CONTRADICTION_THRESHOLD = 0.45

/** Plafond de confiance imposé par la meilleure source disponible. */
export function sourceCeiling(sources: readonly Source[]): number {
  if (sources.length === 0) return 0
  let ceiling = 0
  for (const source of sources) {
    const reliability = SOURCE_RELIABILITY[source.type] ?? 0
    if (reliability > ceiling) ceiling = reliability
  }
  // Plusieurs sources indépendantes renforcent modérément la confiance,
  // sans jamais faire passer du ouï-dire pour une confirmation officielle.
  const corroboration = Math.min(0.15, 0.05 * (sources.length - 1))
  return Math.min(1, ceiling + corroboration)
}

export interface DupeAssessment {
  link: DupeLink
  original: Perfume | null
  clone: Perfume | null
  /** Confiance déclarée, bornée par la qualité des sources. */
  effectiveConfidence: number
  declaredConfidence: number
  /** `true` si les sources ont fait baisser la confiance déclarée. */
  cappedBySources: boolean
  tier: DupeTier
  /**
   * Contrôle indépendant : similarité mesurée entre les deux pyramides.
   * `null` si l'un des deux parfums est absent de la base.
   */
  measuredSimilarity: number | null
  /** L'attribution est revendiquée forte alors que les compositions divergent. */
  contradicts: boolean
}

function tierOf(
  effectiveConfidence: number,
  sources: readonly Source[],
  verifiedAt: string | null,
): DupeTier {
  if (sources.length === 0) return 'non-source'
  const hasStrongSource = sources.some((s) => s.type === 'marque' || s.type === 'revendeur')
  if (effectiveConfidence >= 0.7 && hasStrongSource && verifiedAt !== null) return 'verifie'
  if (effectiveConfidence >= 0.45) return 'probable'
  return 'rumeur'
}

export function assessDupe(
  link: DupeLink,
  perfumesById: ReadonlyMap<string, Perfume>,
): DupeAssessment {
  const original = perfumesById.get(link.perfumeOriginalId) ?? null
  const clone = perfumesById.get(link.perfumeCloneId) ?? null

  const ceiling = sourceCeiling(link.sources)
  const declaredConfidence = link.confidence
  const effectiveConfidence = Math.min(declaredConfidence, ceiling)

  const measuredSimilarity = original && clone ? similarity(original, clone) : null
  const contradicts =
    measuredSimilarity !== null &&
    effectiveConfidence >= 0.6 &&
    measuredSimilarity < CONTRADICTION_THRESHOLD

  return {
    link,
    original,
    clone,
    declaredConfidence,
    effectiveConfidence,
    cappedBySources: effectiveConfidence < declaredConfidence,
    tier: tierOf(effectiveConfidence, link.sources, link.verifiedAt),
    measuredSimilarity,
    contradicts,
  }
}

/** Trie par palier puis par confiance. Le non-sourcé finit toujours en bas. */
export function sortAssessments(items: readonly DupeAssessment[]): DupeAssessment[] {
  return [...items].sort(
    (a, b) =>
      TIER_RANK[a.tier] - TIER_RANK[b.tier] ||
      b.effectiveConfidence - a.effectiveConfidence ||
      (a.clone?.name ?? '').localeCompare(b.clone?.name ?? ''),
  )
}

export function assessDupesFor(
  perfumeId: string,
  links: readonly DupeLink[],
  perfumesById: ReadonlyMap<string, Perfume>,
): { asOriginal: DupeAssessment[]; asClone: DupeAssessment[] } {
  const asOriginal: DupeAssessment[] = []
  const asClone: DupeAssessment[] = []
  for (const link of links) {
    if (link.perfumeOriginalId === perfumeId) asOriginal.push(assessDupe(link, perfumesById))
    else if (link.perfumeCloneId === perfumeId) asClone.push(assessDupe(link, perfumesById))
  }
  return { asOriginal: sortAssessments(asOriginal), asClone: sortAssessments(asClone) }
}
