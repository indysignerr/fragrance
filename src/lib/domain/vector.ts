import {
  ACCORD_DIM,
  ACCORD_INDEX,
  FACET_DIM,
  FACET_INDEX,
  NOTE_DIM,
  NOTE_INDEX,
  facetOfNote,
} from './vocabulary'
import type { Perfume, PerfumeAccord, PerfumeNote } from './types'

/**
 * Poids des étages de la pyramide.
 *
 * ⚠️ Écart assumé au brief, qui demandait des poids décroissants tête → fond.
 * La similarité perçue entre deux parfums tient au fond et au cœur, pas à la
 * tête : la bergamote ouvre un flacon sur deux, donc la surpondérer rendrait
 * toute la base « similaire » et casserait la détection de redondance, qui est
 * la fonction n°1. Le fond porte la signature et la tenue, il domine donc.
 *
 * Inverser l'ordre ici suffit à revenir à la lettre du brief : c'est la seule
 * constante qui commande la hiérarchie de la pyramide.
 */
export const PYRAMID_WEIGHTS = {
  tete: 0.5,
  coeur: 0.8,
  fond: 1,
} as const

/**
 * Répartition de la similarité finale entre les trois espaces comparés.
 * La somme vaut 1, ce qui garantit que le vecteur combiné est unitaire.
 */
export const BLEND_WEIGHTS = {
  notes: 0.45,
  accords: 0.35,
  facets: 0.2,
} as const

export const COMBINED_DIM = NOTE_DIM + ACCORD_DIM + FACET_DIM

export type Axis = 'notes' | 'accords' | 'facets'

export interface PerfumeVector {
  /** Vecteur notes, L2-normalisé. */
  notes: Float64Array
  /** Vecteur accords, L2-normalisé. */
  accords: Float64Array
  /** Vecteur facettes (dérivé des notes), L2-normalisé. */
  facets: Float64Array
  /**
   * Concaténation des trois sous-vecteurs, chacun multiplié par √poids.
   * Propriété recherchée : `dot(a.combined, b.combined)` vaut exactement
   * `Σ w_k · cos_k(a, b)`, soit la similarité mixte. C'est ce vecteur qu'on
   * stocke en base et que l'opérateur cosinus de pgvector compare.
   */
  combined: Float64Array
  /**
   * `true` si au moins un poids de note ou de force d'accord manquait à la
   * source et a été reconstruit par répartition uniforme. Le vecteur reste
   * exploitable, mais l'interface doit signaler l'approximation.
   */
  approximated: boolean
  /**
   * Axes réellement renseignés. Un axe vide n'est pas un axe à zéro : c'est un
   * axe inconnu, et la comparaison doit l'ignorer au lieu de le compter comme
   * une divergence.
   */
  presentAxes: Record<Axis, boolean>
  /** Somme des poids de mélange des axes présents. */
  availableWeight: number
}

function l2normalize(vec: Float64Array): Float64Array {
  let sumSquares = 0
  for (let i = 0; i < vec.length; i++) sumSquares += vec[i] * vec[i]
  if (sumSquares === 0) return vec
  const norm = Math.sqrt(sumSquares)
  for (let i = 0; i < vec.length; i++) vec[i] /= norm
  return vec
}

/**
 * Poids effectif d'une note : poids déclaré par la source si présent, sinon
 * répartition uniforme dans son étage. Le tout est modulé par le poids de
 * l'étage.
 */
function noteContributions(notes: readonly PerfumeNote[]): {
  contributions: Map<string, number>
  approximated: boolean
} {
  const byLevel = new Map<string, PerfumeNote[]>()
  for (const note of notes) {
    if (!NOTE_INDEX.has(note.noteId)) continue // hors vocabulaire : ignoré, jamais inventé
    const bucket = byLevel.get(note.level)
    if (bucket) bucket.push(note)
    else byLevel.set(note.level, [note])
  }

  const contributions = new Map<string, number>()
  let approximated = false

  for (const [level, levelNotes] of byLevel) {
    const levelWeight = PYRAMID_WEIGHTS[level as keyof typeof PYRAMID_WEIGHTS] ?? 0
    const declared = levelNotes.reduce((sum, n) => sum + (n.weight ?? 0), 0)
    const missing = levelNotes.filter((n) => n.weight === null).length
    if (missing > 0) approximated = true

    // Le reliquat non déclaré est réparti à parts égales entre les notes sans poids.
    const remainder = Math.max(0, 1 - declared)
    const perMissing = missing > 0 ? remainder / missing : 0

    for (const note of levelNotes) {
      const share = note.weight ?? perMissing
      const value = share * levelWeight
      contributions.set(note.noteId, (contributions.get(note.noteId) ?? 0) + value)
    }
  }

  return { contributions, approximated }
}

export function buildNoteVector(notes: readonly PerfumeNote[]): {
  vector: Float64Array
  approximated: boolean
} {
  const { contributions, approximated } = noteContributions(notes)
  const vector = new Float64Array(NOTE_DIM)
  for (const [noteId, value] of contributions) {
    const index = NOTE_INDEX.get(noteId)
    if (index !== undefined) vector[index] += value
  }
  return { vector: l2normalize(vector), approximated }
}

/**
 * Vecteur de facettes, dérivé des notes. Il capte la parenté entre deux
 * parfums qui ne partagent aucune note littérale mais jouent la même famille.
 */
export function buildFacetVector(notes: readonly PerfumeNote[]): Float64Array {
  const { contributions } = noteContributions(notes)
  const vector = new Float64Array(FACET_DIM)
  for (const [noteId, value] of contributions) {
    const facet = facetOfNote(noteId)
    if (!facet) continue
    const index = FACET_INDEX.get(facet)
    if (index !== undefined) vector[index] += value
  }
  return l2normalize(vector)
}

export function buildAccordVector(accords: readonly PerfumeAccord[]): {
  vector: Float64Array
  approximated: boolean
} {
  const vector = new Float64Array(ACCORD_DIM)
  let approximated = false
  const known = accords.filter((a) => ACCORD_INDEX.has(a.accordId))
  const missing = known.filter((a) => a.strength === null).length
  if (missing > 0) approximated = true

  // Sans force déclarée, les accords sont supposés d'égale importance.
  const fallback = known.length > 0 ? 1 / known.length : 0
  for (const accord of known) {
    const index = ACCORD_INDEX.get(accord.accordId)
    if (index === undefined) continue
    vector[index] += accord.strength ?? fallback
  }
  return { vector: l2normalize(vector), approximated }
}

export function buildPerfumeVector(perfume: Perfume): PerfumeVector {
  const noteResult = buildNoteVector(perfume.notes)
  const accordResult = buildAccordVector(perfume.accords)
  const facets = buildFacetVector(perfume.notes)

  const presentAxes: Record<Axis, boolean> = {
    notes: hasSignal(noteResult.vector),
    accords: hasSignal(accordResult.vector),
    facets: hasSignal(facets),
  }
  const availableWeight =
    (presentAxes.notes ? BLEND_WEIGHTS.notes : 0) +
    (presentAxes.accords ? BLEND_WEIGHTS.accords : 0) +
    (presentAxes.facets ? BLEND_WEIGHTS.facets : 0)

  // Les axes présents se partagent la totalité du poids : le vecteur combiné
  // reste unitaire même quand une source ne documente pas les accords.
  const combined = new Float64Array(COMBINED_DIM)
  const share = availableWeight > 0 ? 1 / availableWeight : 0
  const noteScale = presentAxes.notes ? Math.sqrt(BLEND_WEIGHTS.notes * share) : 0
  const accordScale = presentAxes.accords ? Math.sqrt(BLEND_WEIGHTS.accords * share) : 0
  const facetScale = presentAxes.facets ? Math.sqrt(BLEND_WEIGHTS.facets * share) : 0

  let offset = 0
  for (let i = 0; i < NOTE_DIM; i++) combined[offset + i] = noteResult.vector[i] * noteScale
  offset += NOTE_DIM
  for (let i = 0; i < ACCORD_DIM; i++) combined[offset + i] = accordResult.vector[i] * accordScale
  offset += ACCORD_DIM
  for (let i = 0; i < FACET_DIM; i++) combined[offset + i] = facets[i] * facetScale

  return {
    notes: noteResult.vector,
    accords: accordResult.vector,
    facets,
    combined,
    approximated: noteResult.approximated || accordResult.approximated,
    presentAxes,
    availableWeight,
  }
}

function hasSignal(vec: Float64Array): boolean {
  for (let i = 0; i < vec.length; i++) if (vec[i] !== 0) return true
  return false
}

/** Produit scalaire. Sur des vecteurs unitaires, c'est le cosinus. */
export function dot(a: Float64Array, b: Float64Array): number {
  const length = Math.min(a.length, b.length)
  let total = 0
  for (let i = 0; i < length; i++) total += a[i] * b[i]
  return total
}

export function cosine(a: Float64Array, b: Float64Array): number {
  let dotProduct = 0
  let normA = 0
  let normB = 0
  const length = Math.min(a.length, b.length)
  for (let i = 0; i < length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

/** Moyenne pondérée de vecteurs, renormalisée. Sert au centroïde de goût. */
export function weightedCentroid(
  entries: readonly { vector: Float64Array; weight: number }[],
): Float64Array | null {
  if (entries.length === 0) return null
  const dimension = entries[0].vector.length
  const centroid = new Float64Array(dimension)
  let totalWeight = 0
  for (const { vector, weight } of entries) {
    if (weight <= 0) continue
    totalWeight += weight
    for (let i = 0; i < dimension; i++) centroid[i] += vector[i] * weight
  }
  if (totalWeight === 0) return null
  for (let i = 0; i < dimension; i++) centroid[i] /= totalWeight
  return l2normalize(centroid)
}

/** Sérialisation au format littéral pgvector : `[0.1,0.2,…]`. */
export function toPgVector(vector: Float64Array): string {
  return `[${Array.from(vector, (v) => v.toFixed(6)).join(',')}]`
}

export function fromPgVector(literal: string): Float64Array {
  const parts = literal.replace(/^\[|\]$/g, '').split(',')
  const vector = new Float64Array(parts.length)
  for (let i = 0; i < parts.length; i++) vector[i] = Number.parseFloat(parts[i])
  return vector
}

/**
 * Poids effectif de chaque note d'un parfum, après application des poids
 * d'étage. Exposé pour que la comparaison puisse expliquer *pourquoi* deux
 * parfums se ressemblent, note par note.
 */
export function noteWeightMap(notes: readonly PerfumeNote[]): Map<string, number> {
  return noteContributions(notes).contributions
}

/** Étage d'origine de chaque note, pour l'affichage de la pyramide. */
export function noteLevelMap(notes: readonly PerfumeNote[]): Map<string, PerfumeNote['level']> {
  const levels = new Map<string, PerfumeNote['level']>()
  const order: PerfumeNote['level'][] = ['fond', 'coeur', 'tete']
  for (const note of notes) {
    const current = levels.get(note.noteId)
    // En cas de doublon entre étages, on retient le plus structurant.
    if (!current || order.indexOf(note.level) > order.indexOf(current)) {
      levels.set(note.noteId, note.level)
    }
  }
  return levels
}
