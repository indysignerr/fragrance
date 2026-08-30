import type { Intensity, Perfume } from './types'
import { compare } from './similarity'
import { facetOfNote } from './vocabulary'
import { noteWeightMap } from './vector'

/**
 * Fonction n°5 : le layering entre flacons possédés.
 *
 * Deux parfums trop proches ne se superposent pas — ils se répètent. Trop
 * éloignés, ils se contredisent. La zone utile est une bande intermédiaire,
 * doublée d'une condition d'ancrage : il faut une famille de fond commune pour
 * que la superposition tienne au lieu de se scinder en deux odeurs distinctes.
 */
export const LAYERING_BAND = { min: 0.22, max: 0.62 } as const

/** Familles de fond capables de servir de socle commun. */
export const ANCHOR_FACETS: readonly string[] = [
  'ambree',
  'musquee',
  'boisee-cremeuse',
  'boisee-seche',
  'balsamique',
  'gourmande',
  'resineuse',
]

const INTENSITY_LEVEL: Record<Intensity, number> = {
  discret: 1,
  modere: 2,
  puissant: 3,
}

export interface LayeringSuggestion {
  a: Perfume
  b: Perfume
  /** Similarité mixte. Doit tomber dans `LAYERING_BAND`. */
  similarity: number
  /** Facettes de fond partagées, qui servent de socle. */
  anchors: string[]
  /** Notes que l'un apporte et que l'autre n'a pas — l'intérêt du mélange. */
  contributedByA: string[]
  contributedByB: string[]
  /**
   * Dosage conseillé en pulvérisations, `a:b`. `null` si l'intensité d'au moins
   * un des deux n'est pas sourcée : on ne devine pas un dosage.
   */
  ratio: { a: number; b: number } | null
  ratioNote: string
  score: number
}

/** Facettes dominantes du fond et du cœur d'un parfum. */
function anchorFacetsOf(perfume: Perfume): Set<string> {
  const weights = noteWeightMap(perfume.notes)
  const byFacet = new Map<string, number>()
  for (const [noteId, weight] of weights) {
    const facet = facetOfNote(noteId)
    if (!facet || !ANCHOR_FACETS.includes(facet)) continue
    byFacet.set(facet, (byFacet.get(facet) ?? 0) + weight)
  }
  let max = 0
  for (const value of byFacet.values()) if (value > max) max = value
  if (max === 0) return new Set()
  // On ne retient qu'une facette réellement structurante du parfum.
  const anchors = new Set<string>()
  for (const [facet, value] of byFacet) if (value >= max * 0.4) anchors.add(facet)
  return anchors
}

/**
 * Dosage : le plus puissant des deux reçoit le moins de pulvérisations.
 * Le rapport est le rapport inverse des intensités, ramené à de petits entiers.
 */
function ratioFor(a: Perfume, b: Perfume): { ratio: { a: number; b: number } | null; note: string } {
  if (a.intensity === null || b.intensity === null) {
    const missing = [a.intensity === null ? a.name : null, b.intensity === null ? b.name : null]
      .filter(Boolean)
      .join(' et ')
    return { ratio: null, note: `Dosage non calculable : intensité non sourcée pour ${missing}.` }
  }
  const levelA = INTENSITY_LEVEL[a.intensity]
  const levelB = INTENSITY_LEVEL[b.intensity]
  // Rapport inverse : intensité 3 contre 1 donne 1 pulvérisation contre 3.
  const ratio = { a: levelB, b: levelA }
  const note =
    levelA === levelB
      ? 'Intensités équivalentes : dosage à parts égales.'
      : `${levelA > levelB ? a.name : b.name} est le plus puissant, il passe en retrait.`
  return { ratio, note }
}

export function suggestLayering(
  owned: readonly Perfume[],
  options: { limit?: number } = {},
): LayeringSuggestion[] {
  const limit = options.limit ?? 12
  const suggestions: LayeringSuggestion[] = []

  for (let i = 0; i < owned.length; i++) {
    for (let j = i + 1; j < owned.length; j++) {
      const a = owned[i]
      const b = owned[j]
      const breakdown = compare(a, b)
      if (breakdown.score < LAYERING_BAND.min || breakdown.score > LAYERING_BAND.max) continue

      const anchorsA = anchorFacetsOf(a)
      const anchorsB = anchorFacetsOf(b)
      const anchors = [...anchorsA].filter((facet) => anchorsB.has(facet))
      if (anchors.length === 0) continue // sans socle commun, les deux odeurs se séparent

      const { ratio, note } = ratioFor(a, b)

      // Le meilleur mélange est celui qui reste au centre de la bande — assez
      // proche pour tenir ensemble, assez loin pour apporter quelque chose.
      const bandCenter = (LAYERING_BAND.min + LAYERING_BAND.max) / 2
      const bandHalfWidth = (LAYERING_BAND.max - LAYERING_BAND.min) / 2
      const centrality = 1 - Math.abs(breakdown.score - bandCenter) / bandHalfWidth
      const anchorBonus = Math.min(1, anchors.length / 2)

      suggestions.push({
        a,
        b,
        similarity: breakdown.score,
        anchors,
        contributedByA: breakdown.onlyA.slice(0, 5).map((n) => n.noteId),
        contributedByB: breakdown.onlyB.slice(0, 5).map((n) => n.noteId),
        ratio,
        ratioNote: note,
        score: 0.7 * centrality + 0.3 * anchorBonus,
      })
    }
  }

  suggestions.sort((x, y) => y.score - x.score)
  return suggestions.slice(0, limit)
}
