import type { NoteLevel, Perfume } from './types'
import {
  BLEND_WEIGHTS,
  buildPerfumeVector,
  cosine,
  dot,
  noteLevelMap,
  noteWeightMap,
  type Axis,
  type PerfumeVector,
} from './vector'

export interface NoteComparison {
  noteId: string
  /** Étage dans le parfum où la note est la plus structurante. */
  level: NoteLevel | null
  weightA: number
  weightB: number
  /** Contribution effective au rapprochement : `min(weightA, weightB)`. */
  overlap: number
}

export interface AccordComparison {
  accordId: string
  strengthA: number
  strengthB: number
}

export interface SimilarityBreakdown {
  /**
   * Similarité mixte, 0–1, calculée sur les seuls axes renseignés des deux
   * côtés puis renormalisée. Quand les deux parfums documentent leurs trois
   * axes, elle est rigoureusement égale au cosinus des vecteurs combinés.
   */
  score: number
  noteScore: number
  accordScore: number
  facetScore: number
  /**
   * Axes sur lesquels la comparaison a réellement porté. S'il en manque, le
   * score reste valide mais repose sur moins d'information : l'interface doit
   * le dire plutôt que de présenter un chiffre faussement complet.
   */
  comparableAxes: Axis[]
  /** Notes présentes des deux côtés, les plus contributives en tête. */
  sharedNotes: NoteComparison[]
  /** Notes qui n'existent que dans A — ce que A apporte de plus. */
  onlyA: NoteComparison[]
  /** Notes qui n'existent que dans B. */
  onlyB: NoteComparison[]
  sharedAccords: AccordComparison[]
  /** Vrai si l'un des deux vecteurs a été reconstruit faute de poids sourcés. */
  approximated: boolean
}

/** Cache mémoire des vecteurs : le calcul est pur, le résultat est stable. */
const vectorCache = new WeakMap<Perfume, PerfumeVector>()

export function vectorOf(perfume: Perfume): PerfumeVector {
  const cached = vectorCache.get(perfume)
  if (cached) return cached
  const vector = buildPerfumeVector(perfume)
  vectorCache.set(perfume, vector)
  return vector
}

/**
 * Score seul, sans la ventilation. C'est le chemin chaud des classements.
 *
 * Note : on ne prend pas le raccourci `dot(combined, combined)`. Ce produit
 * scalaire ne coïncide avec le score exact que si les deux parfums renseignent
 * les mêmes axes ; sinon il pénalise l'absence de donnée. Le vecteur combiné
 * sert au tri approché côté base (pgvector), le score exact se calcule ici.
 */
export function similarity(a: Perfume, b: Perfume): number {
  return blend(vectorOf(a), vectorOf(b)).score
}

const AXES: readonly Axis[] = ['notes', 'accords', 'facets']

interface BlendResult {
  score: number
  noteScore: number
  accordScore: number
  facetScore: number
  comparableAxes: Axis[]
}

/**
 * Combine les cosinus des trois espaces en ne retenant que les axes documentés
 * des deux côtés, puis renormalise sur le poids effectivement mobilisé.
 *
 * Un accord manquant est une inconnue, pas un désaccord : le compter comme un
 * cosinus nul reviendrait à décréter que deux parfums diffèrent parce qu'on
 * n'a pas la donnée.
 */
function blend(a: PerfumeVector, b: PerfumeVector): BlendResult {
  const noteScore = cosine(a.notes, b.notes)
  const accordScore = cosine(a.accords, b.accords)
  const facetScore = cosine(a.facets, b.facets)
  const scores: Record<Axis, number> = {
    notes: noteScore,
    accords: accordScore,
    facets: facetScore,
  }

  const comparableAxes: Axis[] = []
  let weighted = 0
  let totalWeight = 0
  for (const axis of AXES) {
    if (!a.presentAxes[axis] || !b.presentAxes[axis]) continue
    comparableAxes.push(axis)
    weighted += BLEND_WEIGHTS[axis] * scores[axis]
    totalWeight += BLEND_WEIGHTS[axis]
  }

  return {
    score: totalWeight === 0 ? 0 : weighted / totalWeight,
    noteScore,
    accordScore,
    facetScore,
    comparableAxes,
  }
}

/**
 * Similarité approchée telle que la calculerait pgvector à partir du seul
 * vecteur stocké. Sert à présélectionner des candidats côté base avant un
 * reclassement exact par `similarity`.
 */
export function approximateSimilarity(a: Perfume, b: Perfume): number {
  return dot(vectorOf(a).combined, vectorOf(b).combined)
}

/**
 * Comparaison détaillée. Le score global est identique à `similarity`, mais on
 * renvoie en plus de quoi le justifier : quelles notes rapprochent réellement
 * les deux parfums, et lesquelles les séparent.
 */
export function compare(a: Perfume, b: Perfume): SimilarityBreakdown {
  const vectorA = vectorOf(a)
  const vectorB = vectorOf(b)

  const weightsA = noteWeightMap(a.notes)
  const weightsB = noteWeightMap(b.notes)
  const levelsA = noteLevelMap(a.notes)
  const levelsB = noteLevelMap(b.notes)

  const sharedNotes: NoteComparison[] = []
  const onlyA: NoteComparison[] = []
  const onlyB: NoteComparison[] = []

  for (const [noteId, weightA] of weightsA) {
    const weightB = weightsB.get(noteId) ?? 0
    const entry: NoteComparison = {
      noteId,
      level: levelsA.get(noteId) ?? null,
      weightA,
      weightB,
      overlap: Math.min(weightA, weightB),
    }
    if (weightB > 0) sharedNotes.push(entry)
    else onlyA.push(entry)
  }

  for (const [noteId, weightB] of weightsB) {
    if (weightsA.has(noteId)) continue
    onlyB.push({
      noteId,
      level: levelsB.get(noteId) ?? null,
      weightA: 0,
      weightB,
      overlap: 0,
    })
  }

  sharedNotes.sort((x, y) => y.overlap - x.overlap)
  onlyA.sort((x, y) => y.weightA - x.weightA)
  onlyB.sort((x, y) => y.weightB - x.weightB)

  const strengthsA = new Map(a.accords.map((x) => [x.accordId, x.strength ?? 0]))
  const sharedAccords: AccordComparison[] = []
  for (const accord of b.accords) {
    const strengthA = strengthsA.get(accord.accordId)
    if (strengthA === undefined) continue
    sharedAccords.push({
      accordId: accord.accordId,
      strengthA,
      strengthB: accord.strength ?? 0,
    })
  }

  const blended = blend(vectorA, vectorB)

  return {
    score: blended.score,
    noteScore: blended.noteScore,
    accordScore: blended.accordScore,
    facetScore: blended.facetScore,
    comparableAxes: blended.comparableAxes,
    sharedNotes,
    onlyA,
    onlyB,
    sharedAccords,
    approximated: vectorA.approximated || vectorB.approximated,
  }
}

/** Distance = complémentarité. Un score bas signifie « apporte autre chose ». */
export function distance(a: Perfume, b: Perfume): number {
  return 1 - similarity(a, b)
}
