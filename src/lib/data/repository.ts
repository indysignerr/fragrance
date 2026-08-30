import type {
  CollectionEntry,
  DupeLink,
  Perfume,
  WishlistEntry,
} from '@/lib/domain/types'

/**
 * Contrat de stockage.
 *
 * Deux implémentations le respectent : un dépôt JSON local, qui tourne sans
 * aucune infrastructure, et un dépôt Postgres/pgvector. Le moteur ne dépend
 * d'aucune des deux — il ne manipule que des `Perfume`.
 */
export interface Repository {
  listPerfumes(): Promise<Perfume[]>
  getPerfume(id: string): Promise<Perfume | null>
  /** Recherche par marque et nom. Aucune correspondance approximative silencieuse. */
  searchPerfumes(query: string, limit?: number): Promise<Perfume[]>
  listDupeLinks(): Promise<DupeLink[]>

  getCollection(userId: string): Promise<CollectionEntry[]>
  getWishlist(userId: string): Promise<WishlistEntry[]>
  upsertCollectionEntry(entry: CollectionEntry): Promise<void>
  removeCollectionEntry(userId: string, perfumeId: string): Promise<void>
  upsertWishlistEntry(entry: WishlistEntry): Promise<void>
  removeWishlistEntry(userId: string, perfumeId: string): Promise<void>

  /** Décrit la source de stockage active, pour l'afficher dans l'interface. */
  describe(): RepositoryInfo
}

export interface RepositoryInfo {
  kind: 'json' | 'postgres'
  label: string
  /** Message d'avertissement à afficher, le cas échéant. */
  warning: string | null
}

/** Utilisateur unique de la v1. Le modèle reste multi-utilisateur en base. */
export const DEFAULT_USER_ID = 'local'
