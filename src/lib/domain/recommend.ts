import type { Perfume } from './types'
import { similarity } from './similarity'
import { gapFit, type CoverageGrid } from './coverage'
import { REDUNDANCY_THRESHOLDS } from './redundancy'
import { affinity, type TasteProfile } from './taste'

/**
 * Fonction n°3 : recommander.
 *
 * Deux modes, deux fonctions de score explicites. Aucun apprentissage, aucun
 * aléatoire : à collection et wishlist identiques, le classement est identique.
 */
export type RecommendationMode = 'comble-un-trou' | 'reste-dans-ce-que-jaime'

/** Affinité minimale sous laquelle un parfum sort du profil, même s'il est neuf. */
export const AFFINITY_FLOOR = 0.35

export const MODE_WEIGHTS = {
  'comble-un-trou': { novelty: 0.45, affinity: 0.3, gap: 0.25 },
  'reste-dans-ce-que-jaime': { novelty: 0.15, affinity: 0.75, gap: 0.1 },
} as const

export interface RecommendationComponents {
  /** 1 − similarité au flacon possédé le plus proche. */
  novelty: number
  /** Proximité au centroïde de goût. */
  affinity: number
  /** Part des cases de couverture vides que le parfum remplirait. */
  gap: number
  /** `true` si le parfum n'est pas plaçable dans la grille : `gap` est neutralisé. */
  gapUnknown: boolean
}

export interface Recommendation {
  perfume: Perfume
  score: number
  components: RecommendationComponents
  /** Flacon possédé le plus proche, pour situer la proposition. */
  nearestOwned: { perfume: Perfume; similarity: number } | null
  /** Motif du classement, en clair et sans LLM. */
  rationale: string
}

export interface RecommendOptions {
  mode: RecommendationMode
  limit?: number
  /** Exclut les parfums déjà en collection ou en wishlist. */
  excludeIds?: ReadonlySet<string>
  affinityFloor?: number
}

export interface RecommendationResult {
  mode: RecommendationMode
  items: Recommendation[]
  /** Candidats écartés, avec le motif — la transparence fait partie du produit. */
  rejected: { perfumeId: string; reason: string }[]
  /** Fiabilité héritée du profil de goût. */
  profileConfidence: number
}

function nearestOwnedOf(
  candidate: Perfume,
  owned: readonly Perfume[],
): { perfume: Perfume; similarity: number } | null {
  let best: { perfume: Perfume; similarity: number } | null = null
  for (const bottle of owned) {
    if (bottle.id === candidate.id) continue
    const score = similarity(candidate, bottle)
    if (!best || score > best.similarity) best = { perfume: bottle, similarity: score }
  }
  return best
}

export function recommend(
  catalogue: readonly Perfume[],
  owned: readonly Perfume[],
  profile: TasteProfile,
  grid: CoverageGrid,
  options: RecommendOptions,
): RecommendationResult {
  const limit = options.limit ?? 12
  const floor = options.affinityFloor ?? AFFINITY_FLOOR
  const exclude = options.excludeIds ?? new Set<string>()
  const weights = MODE_WEIGHTS[options.mode]

  const items: Recommendation[] = []
  const rejected: { perfumeId: string; reason: string }[] = []

  for (const candidate of catalogue) {
    if (exclude.has(candidate.id)) continue

    const nearestOwned = nearestOwnedOf(candidate, owned)
    const closestSimilarity = nearestOwned?.similarity ?? 0

    // Filtre dur commun aux deux modes : ne jamais proposer un doublon.
    if (closestSimilarity >= REDUNDANCY_THRESHOLDS.redondant) {
      rejected.push({
        perfumeId: candidate.id,
        reason: `redondant avec ${nearestOwned?.perfume.name} (${(closestSimilarity * 100).toFixed(0)} %)`,
      })
      continue
    }

    const candidateAffinity = affinity(profile, candidate)
    if (profile.centroid && candidateAffinity < floor) {
      rejected.push({
        perfumeId: candidate.id,
        reason: `hors profil de goût (affinité ${(candidateAffinity * 100).toFixed(0)} %)`,
      })
      continue
    }

    const rawGap = gapFit(candidate, grid)
    const components: RecommendationComponents = {
      novelty: 1 - closestSimilarity,
      affinity: candidateAffinity,
      gap: rawGap ?? 0,
      gapUnknown: rawGap === null,
    }

    // Un parfum non plaçable ne doit être ni récompensé ni puni sur cet axe :
    // on redistribue le poids de `gap` sur les deux autres composantes.
    let score: number
    if (components.gapUnknown) {
      const redistributed = weights.novelty + weights.affinity
      score =
        ((weights.novelty * components.novelty + weights.affinity * components.affinity) /
          redistributed) *
        (weights.novelty + weights.affinity + weights.gap)
    } else {
      score =
        weights.novelty * components.novelty +
        weights.affinity * components.affinity +
        weights.gap * components.gap
    }

    items.push({
      perfume: candidate,
      score,
      components,
      nearestOwned,
      rationale: buildRationale(options.mode, components, nearestOwned),
    })
  }

  items.sort((a, b) => b.score - a.score || a.perfume.id.localeCompare(b.perfume.id))

  return {
    mode: options.mode,
    items: items.slice(0, limit),
    rejected,
    profileConfidence: profile.confidence,
  }
}

/** Explication déterministe, produite sans LLM. Le LLM ne fait que la reformuler. */
function buildRationale(
  mode: RecommendationMode,
  components: RecommendationComponents,
  nearestOwned: { perfume: Perfume; similarity: number } | null,
): string {
  const parts: string[] = []
  if (nearestOwned) {
    parts.push(
      `le plus proche de votre collection est ${nearestOwned.perfume.brand} ${nearestOwned.perfume.name} à ${(nearestOwned.similarity * 100).toFixed(0)} %`,
    )
  } else {
    parts.push('rien de comparable dans votre collection')
  }
  parts.push(`affinité avec votre profil ${(components.affinity * 100).toFixed(0)} %`)
  if (components.gapUnknown) {
    parts.push('placement dans la grille inconnu, faute de saison, moment ou intensité sourcés')
  } else if (components.gap > 0) {
    parts.push(`remplit ${(components.gap * 100).toFixed(0)} % des créneaux qu'il occupe`)
  } else {
    parts.push('ne remplit aucune case vide')
  }
  const lead = mode === 'comble-un-trou' ? 'Écart maximal recherché' : 'Dans la continuité du profil'
  return `${lead} : ${parts.join(' ; ')}.`
}
