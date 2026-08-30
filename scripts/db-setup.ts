/**
 * Crée le schéma Postgres, charge l'amorce et calcule les embeddings.
 *
 * Idempotent : relançable sans dupliquer. À lancer après avoir renseigné
 * `DATABASE_URL` dans `.env.local`.
 *
 *   npm run db:setup            applique le schéma et charge l'amorce
 *   npm run db:setup -- --print affiche le DDL sans se connecter
 */
import { readFileSync } from 'node:fs'

import { Pool } from 'pg'

import { schemaSql } from '@/lib/data/schema'
import { expandPerfume, seedFileSchema } from '@/lib/data/seed-format'
import { vectorOf } from '@/lib/domain/similarity'
import { toPgVector } from '@/lib/domain/vector'
import { VOCABULARY_VERSION } from '@/lib/domain/vocabulary'
import type { Provenance } from '@/lib/domain/types'

async function main() {
  const ddl = schemaSql()

  if (process.argv.includes('--print')) {
    console.log(ddl)
    return
  }

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error(
      'DATABASE_URL absent. Renseignez-le dans .env.local, ou lancez avec --print pour seulement voir le DDL.',
    )
    process.exit(1)
  }

  const raw = JSON.parse(readFileSync('data/seed/catalogue.json', 'utf8')) as unknown
  const seed = seedFileSchema.parse(raw)
  const provenance: Provenance = {
    sources: seed.provenance.sources,
    collectedAt: seed.provenance.collectedAt,
    verifiedAt: seed.provenance.verifiedAt,
  }

  const pool = new Pool({ connectionString })
  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    await client.query(ddl)

    for (const seedPerfume of seed.perfumes) {
      const perfume = expandPerfume(seedPerfume, provenance)
      const embedding = toPgVector(vectorOf(perfume).combined)

      await client.query(
        `INSERT INTO perfume (id, brand, name, year, concentration, perfumers, family,
                              seasons, moments, intensity, collected_at, verified_at,
                              vocabulary_version, embedding, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::vector, now())
         ON CONFLICT (id) DO UPDATE SET
           brand = EXCLUDED.brand, name = EXCLUDED.name, year = EXCLUDED.year,
           concentration = EXCLUDED.concentration, perfumers = EXCLUDED.perfumers,
           family = EXCLUDED.family, seasons = EXCLUDED.seasons, moments = EXCLUDED.moments,
           intensity = EXCLUDED.intensity, collected_at = EXCLUDED.collected_at,
           verified_at = EXCLUDED.verified_at,
           vocabulary_version = EXCLUDED.vocabulary_version,
           embedding = EXCLUDED.embedding, updated_at = now()`,
        [
          perfume.id, perfume.brand, perfume.name, perfume.year, perfume.concentration,
          perfume.perfumers, perfume.family, perfume.seasons, perfume.moments,
          perfume.intensity, perfume.provenance.collectedAt, perfume.provenance.verifiedAt,
          VOCABULARY_VERSION, embedding,
        ],
      )

      // Les tables filles sont réécrites intégralement : c'est l'amorce qui
      // fait foi, et un reliquat d'un ancien chargement fausserait le vecteur.
      await client.query('DELETE FROM perfume_note WHERE perfume_id = $1', [perfume.id])
      for (const note of perfume.notes) {
        await client.query(
          `INSERT INTO perfume_note (perfume_id, note_id, level, weight) VALUES ($1,$2,$3,$4)
           ON CONFLICT (perfume_id, note_id, level) DO UPDATE SET weight = EXCLUDED.weight`,
          [perfume.id, note.noteId, note.level, note.weight],
        )
      }

      await client.query('DELETE FROM perfume_accord WHERE perfume_id = $1', [perfume.id])
      for (const accord of perfume.accords) {
        await client.query(
          `INSERT INTO perfume_accord (perfume_id, accord_id, strength) VALUES ($1,$2,$3)
           ON CONFLICT (perfume_id, accord_id) DO UPDATE SET strength = EXCLUDED.strength`,
          [perfume.id, accord.accordId, accord.strength],
        )
      }

      await client.query('DELETE FROM perfume_source WHERE perfume_id = $1', [perfume.id])
      for (const source of perfume.provenance.sources) {
        await client.query(
          `INSERT INTO perfume_source (perfume_id, type, url, label) VALUES ($1,$2,$3,$4)`,
          [perfume.id, source.type, source.url, source.label],
        )
      }
    }

    for (const link of seed.dupeLinks) {
      await client.query(
        `INSERT INTO dupe_link (id, perfume_original_id, perfume_clone_id, confidence, verified_at)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (id) DO UPDATE SET
           perfume_original_id = EXCLUDED.perfume_original_id,
           perfume_clone_id = EXCLUDED.perfume_clone_id,
           confidence = EXCLUDED.confidence, verified_at = EXCLUDED.verified_at`,
        [link.id, link.perfumeOriginalId, link.perfumeCloneId, link.confidence, link.verifiedAt],
      )
      await client.query('DELETE FROM dupe_source WHERE dupe_link_id = $1', [link.id])
      for (const source of link.sources) {
        await client.query(
          `INSERT INTO dupe_source (dupe_link_id, type, url, label) VALUES ($1,$2,$3,$4)`,
          [link.id, source.type, source.url, source.label],
        )
      }
    }

    await client.query('COMMIT')

    const { rows } = await client.query<{ count: string; stale: string }>(
      `SELECT count(*) AS count,
              count(*) FILTER (WHERE vocabulary_version IS DISTINCT FROM $1) AS stale
         FROM perfume`,
      [VOCABULARY_VERSION],
    )
    console.log(
      `✓ ${rows[0].count} parfums, ${seed.dupeLinks.length} correspondances — vocabulaire ${VOCABULARY_VERSION}`,
    )
    if (Number(rows[0].stale) > 0) {
      console.warn(
        `⚠ ${rows[0].stale} parfums portent une autre empreinte de vocabulaire : leurs vecteurs sont périmés.`,
      )
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
