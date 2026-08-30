import type { CollectionEntry, Perfume, WishlistEntry } from './types'
import { vectorOf } from './similarity'
import { ACCORD_DIM, ACCORD_IDS, FACET_IDS, NOTE_DIM, NOTE_IDS } from './vocabulary'
import { BLEND_WEIGHTS, dot, weightedCentroid } from './vector'

/**
 * Profil de goût déduit de la collection ET de la wishlist.
 *
 * La wishlist pèse davantage : la collection dit ce que l'utilisateur a pu
 * s'offrir — contrainte de budget, cadeaux, erreurs d'achat — alors que la
 * wishlist dit ce qu'il aime vraiment.
 */
export const TASTE_WEIGHTS = {
  collection: {
    possede: 1,
    /** Pas encore porté : signal d'intention, pas encore de goût confirmé. */
    'en-commande': 0.7,
    /**
     * Flacon terminé : le signal d'appréciation le plus fort de la collection.
     * On ne finit pas un flacon qu'on n'aime pas.
     */
    termine: 1.4,
  },
  wishlist: {
    aime: 2,
    adore: 3,
  },
  /**
   * Wishlist jamais sentie : désir construit sur une réputation, pas sur une
   * expérience olfactive. On ne l'annule pas, on l'atténue.
   */
  neverSmelledFactor: 0.6,
} as const

export interface TasteContribution {
  perfumeId: string
  weight: number
  origin: 'collection' | 'wishlist'
  reason: string
}

export interface TasteDimension {
  id: string
  /** Poids relatif dans le centroïde, 0–1 (rapporté au plus fort). */
  share: number
}

export interface TasteProfile {
  /** Centroïde dans l'espace combiné, ou `null` si aucune donnée. */
  centroid: Float64Array | null
  contributions: TasteContribution[]
  topNotes: TasteDimension[]
  topAccords: TasteDimension[]
  topFacets: TasteDimension[]
  sampleSize: number
  /**
   * Fiabilité du profil, 0–1. Croît avec le nombre d'entrées et la part de
   * wishlist réellement sentie. Sous 0.4, l'interface doit dire que le profil
   * est trop mince pour conclure plutôt que d'afficher des recommandations
   * péremptoires.
   */
  confidence: number
}

function topFromSlice(
  centroid: Float64Array,
  offset: number,
  length: number,
  ids: readonly string[],
  limit: number,
): TasteDimension[] {
  const scored: TasteDimension[] = []
  let max = 0
  for (let i = 0; i < length; i++) {
    const value = centroid[offset + i]
    if (value > max) max = value
  }
  if (max <= 0) return []
  for (let i = 0; i < length; i++) {
    const value = centroid[offset + i]
    if (value <= 0) continue
    scored.push({ id: ids[i], share: value / max })
  }
  scored.sort((a, b) => b.share - a.share)
  return scored.slice(0, limit)
}

export function buildTasteProfile(
  perfumesById: ReadonlyMap<string, Perfume>,
  collection: readonly CollectionEntry[],
  wishlist: readonly WishlistEntry[],
  options: { topLimit?: number } = {},
): TasteProfile {
  const topLimit = options.topLimit ?? 8
  const entries: { vector: Float64Array; weight: number }[] = []
  const contributions: TasteContribution[] = []

  for (const item of collection) {
    const perfume = perfumesById.get(item.perfumeId)
    if (!perfume) continue
    const weight = TASTE_WEIGHTS.collection[item.status]
    entries.push({ vector: vectorOf(perfume).combined, weight })
    contributions.push({
      perfumeId: perfume.id,
      weight,
      origin: 'collection',
      reason:
        item.status === 'termine'
          ? 'flacon terminé — appréciation confirmée'
          : item.status === 'en-commande'
            ? 'en commande — intention, pas encore portée'
            : 'possédé',
    })
  }

  let smelledWishes = 0
  for (const item of wishlist) {
    const perfume = perfumesById.get(item.perfumeId)
    if (!perfume) continue
    const base = TASTE_WEIGHTS.wishlist[item.intensity]
    const weight = item.smelledOrOwned ? base : base * TASTE_WEIGHTS.neverSmelledFactor
    if (item.smelledOrOwned) smelledWishes += 1
    entries.push({ vector: vectorOf(perfume).combined, weight })
    contributions.push({
      perfumeId: perfume.id,
      weight,
      origin: 'wishlist',
      reason: item.smelledOrOwned
        ? `${item.intensity === 'adore' ? 'adoré' : 'aimé'} et senti`
        : `${item.intensity === 'adore' ? 'adoré' : 'aimé'} mais jamais senti — signal atténué`,
    })
  }

  contributions.sort((a, b) => b.weight - a.weight)
  const centroid = weightedCentroid(entries)
  const sampleSize = entries.length

  // Fiabilité : volume d'échantillon plafonné à 12 entrées, bonifié par la
  // part de souhaits réellement sentis.
  const volumeScore = Math.min(1, sampleSize / 12)
  const smelledRatio = wishlist.length > 0 ? smelledWishes / wishlist.length : 0
  const confidence = sampleSize === 0 ? 0 : 0.75 * volumeScore + 0.25 * smelledRatio

  if (!centroid) {
    return {
      centroid: null,
      contributions,
      topNotes: [],
      topAccords: [],
      topFacets: [],
      sampleSize,
      confidence: 0,
    }
  }

  return {
    centroid,
    contributions,
    topNotes: topFromSlice(centroid, 0, NOTE_DIM, NOTE_IDS, topLimit),
    topAccords: topFromSlice(centroid, NOTE_DIM, ACCORD_DIM, ACCORD_IDS, topLimit),
    topFacets: topFromSlice(centroid, NOTE_DIM + ACCORD_DIM, FACET_IDS.length, FACET_IDS, topLimit),
    sampleSize,
    confidence,
  }
}

/**
 * Affinité d'un parfum avec le profil, 0–1.
 * Toutes les composantes étant positives, le produit scalaire de deux vecteurs
 * unitaires reste dans [0, 1].
 */
export function affinity(profile: TasteProfile, perfume: Perfume): number {
  if (!profile.centroid) return 0
  return dot(profile.centroid, vectorOf(perfume).combined)
}

/** Somme des poids de mélange — invariant vérifié par les tests. */
export const BLEND_TOTAL =
  BLEND_WEIGHTS.notes + BLEND_WEIGHTS.accords + BLEND_WEIGHTS.facets
