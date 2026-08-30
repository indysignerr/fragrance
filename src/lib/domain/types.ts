/**
 * Types du domaine.
 *
 * Règle transverse : aucune valeur numérique, pyramide ou attribution n'est
 * affichable sans `Provenance`. Une donnée absente vaut `null` et se rend
 * comme « inconnu » — jamais comme une valeur par défaut silencieuse.
 */

export type SourceType =
  | 'marque' // communiqué / site officiel de la maison
  | 'revendeur' // fiche produit d'un distributeur
  | 'communaute' // base collaborative, forum, avis
  | 'seed-manuel' // amorce saisie à la main, non vérifiée

/** Fiabilité intrinsèque d'un type de source. Utilisé pour borner les scores. */
export const SOURCE_RELIABILITY: Record<SourceType, number> = {
  marque: 1,
  revendeur: 0.6,
  communaute: 0.35,
  'seed-manuel': 0.15,
}

export interface Source {
  type: SourceType
  /** URL publique consultable. Absente pour une amorce manuelle. */
  url: string | null
  /** Libellé lisible : « Parfumo », « Nez officiel de la maison »… */
  label: string
}

export interface Provenance {
  sources: Source[]
  /** ISO 8601. `null` = jamais collecté, donc à afficher comme incertain. */
  collectedAt: string | null
  /** Dernière vérification humaine. `null` = non vérifié. */
  verifiedAt: string | null
}

export type NoteLevel = 'tete' | 'coeur' | 'fond'

export interface PerfumeNote {
  /** Identifiant du vocabulaire contrôlé (`src/lib/domain/vocabulary.ts`). */
  noteId: string
  level: NoteLevel
  /**
   * Intensité relative de la note dans son étage, 0–1.
   * `null` quand la source ne hiérarchise pas les notes : on retombe alors
   * sur une répartition uniforme, et le vecteur est marqué approximatif.
   */
  weight: number | null
}

export interface PerfumeAccord {
  accordId: string
  /** Force de l'accord, 0–1. `null` si la source ne la donne pas. */
  strength: number | null
}

export type Season = 'printemps' | 'ete' | 'automne' | 'hiver'
export type Moment = 'jour' | 'soir'
/** Puissance perçue. Alimente la grille de couverture. */
export type Intensity = 'discret' | 'modere' | 'puissant'

export type Concentration =
  | 'eau-de-cologne'
  | 'eau-de-toilette'
  | 'eau-de-parfum'
  | 'extrait'
  | 'inconnue'

export interface Perfume {
  id: string
  brand: string
  name: string
  /** Année de sortie. `null` si non sourcée. */
  year: number | null
  concentration: Concentration
  /** Parfumeur·s. Tableau vide = non sourcé, pas « anonyme ». */
  perfumers: string[]
  notes: PerfumeNote[]
  accords: PerfumeAccord[]
  /** Famille olfactive principale, id du vocabulaire des facettes. */
  family: string | null
  seasons: Season[]
  moments: Moment[]
  intensity: Intensity | null
  provenance: Provenance
}

export interface DupeLink {
  id: string
  perfumeOriginalId: string
  perfumeCloneId: string
  /** Confiance déclarée de la correspondance, 0–1. */
  confidence: number
  sources: Source[]
  verifiedAt: string | null
}

export type CollectionStatus = 'possede' | 'en-commande' | 'termine'

export interface CollectionEntry {
  userId: string
  perfumeId: string
  status: CollectionStatus
  /** ISO date. `null` si l'utilisateur ne l'a pas renseignée. */
  acquiredAt: string | null
}

export type WishIntensity = 'aime' | 'adore'

export interface WishlistEntry {
  userId: string
  perfumeId: string
  intensity: WishIntensity
  /** L'utilisateur a-t-il réellement senti ce parfum ? Un « adoré » jamais senti
   *  pèse moins qu'un « aimé » porté sur peau. */
  smelledOrOwned: boolean
}
