import 'server-only'

import { Pool } from 'pg'

import type {
  CollectionEntry,
  Concentration,
  DupeLink,
  Intensity,
  Moment,
  Perfume,
  Season,
  Source,
  SourceType,
  WishlistEntry,
} from '@/lib/domain/types'
import { toPgVector } from '@/lib/domain/vector'
import { vectorOf } from '@/lib/domain/similarity'
import type { Repository, RepositoryInfo } from './repository'

/**
 * Dépôt Postgres / pgvector.
 *
 * ⚠️ Écrit mais jamais exécuté : aucune base n'était disponible pendant le
 * développement. Le schéma, les requêtes et l'assemblage sont vérifiés par le
 * typage, pas par une exécution réelle. Passer `DATABASE_URL` puis lancer
 * `npm run db:setup` valide l'ensemble contre une vraie instance.
 *
 * L'embedding sert exclusivement à présélectionner des candidats. Le score
 * affiché est toujours recalculé en TypeScript : lui seul sait ignorer un axe
 * non renseigné au lieu de le compter comme une divergence.
 */

let pool: Pool | null = null

function getPool(connectionString: string): Pool {
  if (!pool) pool = new Pool({ connectionString, max: 5 })
  return pool
}

interface PerfumeRow {
  id: string
  brand: string
  name: string
  year: number | null
  concentration: string
  perfumers: string[] | null
  family: string | null
  seasons: string[] | null
  moments: string[] | null
  intensity: string | null
  collected_at: Date | null
  verified_at: Date | null
}

function isoDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null
}

export class PostgresRepository implements Repository {
  private readonly pool: Pool

  constructor(connectionString: string) {
    this.pool = getPool(connectionString)
  }

  /** Recompose les parfums à partir des quatre tables, en 4 requêtes fixes. */
  private async hydrate(where: string, params: unknown[]): Promise<Perfume[]> {
    const { rows } = await this.pool.query<PerfumeRow>(
      `SELECT id, brand, name, year, concentration, perfumers, family, seasons,
              moments, intensity, collected_at, verified_at
         FROM perfume ${where}`,
      params,
    )
    if (rows.length === 0) return []

    const ids = rows.map((row) => row.id)
    const [notes, accords, sources] = await Promise.all([
      this.pool.query<{ perfume_id: string; note_id: string; level: string; weight: number | null }>(
        `SELECT perfume_id, note_id, level, weight FROM perfume_note WHERE perfume_id = ANY($1)`,
        [ids],
      ),
      this.pool.query<{ perfume_id: string; accord_id: string; strength: number | null }>(
        `SELECT perfume_id, accord_id, strength FROM perfume_accord WHERE perfume_id = ANY($1)`,
        [ids],
      ),
      this.pool.query<{ perfume_id: string; type: string; url: string | null; label: string }>(
        `SELECT perfume_id, type, url, label FROM perfume_source WHERE perfume_id = ANY($1)`,
        [ids],
      ),
    ])

    const notesById = new Map<string, Perfume['notes']>()
    for (const row of notes.rows) {
      const list = notesById.get(row.perfume_id) ?? []
      list.push({ noteId: row.note_id, level: row.level as Perfume['notes'][number]['level'], weight: row.weight })
      notesById.set(row.perfume_id, list)
    }

    const accordsById = new Map<string, Perfume['accords']>()
    for (const row of accords.rows) {
      const list = accordsById.get(row.perfume_id) ?? []
      list.push({ accordId: row.accord_id, strength: row.strength })
      accordsById.set(row.perfume_id, list)
    }

    const sourcesById = new Map<string, Source[]>()
    for (const row of sources.rows) {
      const list = sourcesById.get(row.perfume_id) ?? []
      list.push({ type: row.type as SourceType, url: row.url, label: row.label })
      sourcesById.set(row.perfume_id, list)
    }

    return rows.map((row) => ({
      id: row.id,
      brand: row.brand,
      name: row.name,
      year: row.year,
      concentration: row.concentration as Concentration,
      perfumers: row.perfumers ?? [],
      notes: notesById.get(row.id) ?? [],
      accords: accordsById.get(row.id) ?? [],
      family: row.family,
      seasons: (row.seasons ?? []) as Season[],
      moments: (row.moments ?? []) as Moment[],
      intensity: row.intensity as Intensity | null,
      provenance: {
        sources: sourcesById.get(row.id) ?? [],
        collectedAt: isoDate(row.collected_at),
        verifiedAt: isoDate(row.verified_at),
      },
    }))
  }

  async listPerfumes(): Promise<Perfume[]> {
    return this.hydrate('ORDER BY brand, name', [])
  }

  async getPerfume(id: string): Promise<Perfume | null> {
    const [perfume] = await this.hydrate('WHERE id = $1', [id])
    return perfume ?? null
  }

  async searchPerfumes(query: string, limit = 20): Promise<Perfume[]> {
    const trimmed = query.trim()
    if (trimmed.length === 0) return []
    return this.hydrate(
      `WHERE brand ILIKE $1 OR name ILIKE $1
       ORDER BY (name ILIKE $2) DESC, brand, name
       LIMIT $3`,
      [`%${trimmed}%`, `${trimmed}%`, limit],
    )
  }

  /**
   * Présélection par plus proches voisins. Retourne des identifiants à
   * reclasser exactement côté TypeScript — jamais un score affichable.
   */
  async shortlistSimilar(perfume: Perfume, limit = 50): Promise<string[]> {
    const literal = toPgVector(vectorOf(perfume).combined)
    const { rows } = await this.pool.query<{ id: string }>(
      `SELECT id FROM perfume
        WHERE embedding IS NOT NULL AND id <> $2
        ORDER BY embedding <=> $1::vector
        LIMIT $3`,
      [literal, perfume.id, limit],
    )
    return rows.map((row) => row.id)
  }

  async listDupeLinks(): Promise<DupeLink[]> {
    const { rows } = await this.pool.query<{
      id: string
      perfume_original_id: string
      perfume_clone_id: string
      confidence: number
      verified_at: Date | null
    }>(
      `SELECT id, perfume_original_id, perfume_clone_id, confidence, verified_at FROM dupe_link`,
    )
    if (rows.length === 0) return []

    const { rows: sourceRows } = await this.pool.query<{
      dupe_link_id: string
      type: string
      url: string | null
      label: string
    }>(`SELECT dupe_link_id, type, url, label FROM dupe_source WHERE dupe_link_id = ANY($1)`, [
      rows.map((row) => row.id),
    ])

    const sourcesByLink = new Map<string, Source[]>()
    for (const row of sourceRows) {
      const list = sourcesByLink.get(row.dupe_link_id) ?? []
      list.push({ type: row.type as SourceType, url: row.url, label: row.label })
      sourcesByLink.set(row.dupe_link_id, list)
    }

    return rows.map((row) => ({
      id: row.id,
      perfumeOriginalId: row.perfume_original_id,
      perfumeCloneId: row.perfume_clone_id,
      confidence: row.confidence,
      sources: sourcesByLink.get(row.id) ?? [],
      verifiedAt: isoDate(row.verified_at),
    }))
  }

  async getCollection(userId: string): Promise<CollectionEntry[]> {
    const { rows } = await this.pool.query<{
      perfume_id: string
      status: string
      acquired_at: Date | null
    }>(`SELECT perfume_id, status, acquired_at FROM user_collection WHERE user_id = $1`, [userId])
    return rows.map((row) => ({
      userId,
      perfumeId: row.perfume_id,
      status: row.status as CollectionEntry['status'],
      acquiredAt: isoDate(row.acquired_at),
    }))
  }

  async getWishlist(userId: string): Promise<WishlistEntry[]> {
    const { rows } = await this.pool.query<{
      perfume_id: string
      intensity: string
      smelled_or_owned: boolean
    }>(`SELECT perfume_id, intensity, smelled_or_owned FROM user_wishlist WHERE user_id = $1`, [
      userId,
    ])
    return rows.map((row) => ({
      userId,
      perfumeId: row.perfume_id,
      intensity: row.intensity as WishlistEntry['intensity'],
      smelledOrOwned: row.smelled_or_owned,
    }))
  }

  async upsertCollectionEntry(entry: CollectionEntry): Promise<void> {
    await this.pool.query(
      `INSERT INTO user_collection (user_id, perfume_id, status, acquired_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, perfume_id)
       DO UPDATE SET status = EXCLUDED.status, acquired_at = EXCLUDED.acquired_at`,
      [entry.userId, entry.perfumeId, entry.status, entry.acquiredAt],
    )
  }

  async removeCollectionEntry(userId: string, perfumeId: string): Promise<void> {
    await this.pool.query(`DELETE FROM user_collection WHERE user_id = $1 AND perfume_id = $2`, [
      userId,
      perfumeId,
    ])
  }

  async upsertWishlistEntry(entry: WishlistEntry): Promise<void> {
    await this.pool.query(
      `INSERT INTO user_wishlist (user_id, perfume_id, intensity, smelled_or_owned)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, perfume_id)
       DO UPDATE SET intensity = EXCLUDED.intensity, smelled_or_owned = EXCLUDED.smelled_or_owned`,
      [entry.userId, entry.perfumeId, entry.intensity, entry.smelledOrOwned],
    )
  }

  async removeWishlistEntry(userId: string, perfumeId: string): Promise<void> {
    await this.pool.query(`DELETE FROM user_wishlist WHERE user_id = $1 AND perfume_id = $2`, [
      userId,
      perfumeId,
    ])
  }

  describe(): RepositoryInfo {
    return {
      kind: 'postgres',
      label: 'Postgres + pgvector',
      warning:
        "Ce dépôt n'a jamais été exécuté contre une base réelle pendant le développement. Vérifiez `npm run db:setup` avant de vous y fier.",
    }
  }
}
