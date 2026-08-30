import 'server-only'

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { z } from 'zod'

import type {
  CollectionEntry,
  DupeLink,
  Perfume,
  Provenance,
  WishlistEntry,
} from '@/lib/domain/types'
import { normalizeTerm } from '@/lib/domain/vocabulary'
import { expandPerfume, seedFileSchema } from './seed-format'
import { DEFAULT_USER_ID, type Repository, type RepositoryInfo } from './repository'

/**
 * Dépôt de fichiers.
 *
 * Le catalogue est en lecture seule et mis en cache : c'est une amorce versionnée
 * avec le code. Seul l'état utilisateur — collection et wishlist — est écrit,
 * dans un fichier distinct, par écriture atomique (fichier temporaire puis
 * renommage) pour qu'une interruption ne laisse jamais un JSON tronqué.
 */

const CATALOGUE_PATH = join(process.cwd(), 'data', 'seed', 'catalogue.json')
const USER_STATE_PATH = join(process.cwd(), 'data', 'user-state.json')

const userStateSchema = z.object({
  collection: z.array(
    z.object({
      userId: z.string(),
      perfumeId: z.string(),
      status: z.enum(['possede', 'en-commande', 'termine']),
      acquiredAt: z.string().nullable(),
    }),
  ),
  wishlist: z.array(
    z.object({
      userId: z.string(),
      perfumeId: z.string(),
      intensity: z.enum(['aime', 'adore']),
      smelledOrOwned: z.boolean(),
    }),
  ),
})

type UserState = z.infer<typeof userStateSchema>

interface Catalogue {
  perfumes: Perfume[]
  dupeLinks: DupeLink[]
}

let cataloguePromise: Promise<Catalogue> | null = null

async function loadCatalogue(): Promise<Catalogue> {
  if (!cataloguePromise) {
    cataloguePromise = (async () => {
      const raw = JSON.parse(await readFile(CATALOGUE_PATH, 'utf8')) as unknown
      const parsed = seedFileSchema.parse(raw)
      const provenance: Provenance = {
        sources: parsed.provenance.sources,
        collectedAt: parsed.provenance.collectedAt,
        verifiedAt: parsed.provenance.verifiedAt,
      }
      return {
        perfumes: parsed.perfumes.map((seed) => expandPerfume(seed, provenance)),
        dupeLinks: parsed.dupeLinks.map((link) => ({
          id: link.id,
          perfumeOriginalId: link.perfumeOriginalId,
          perfumeCloneId: link.perfumeCloneId,
          confidence: link.confidence,
          sources: link.sources,
          verifiedAt: link.verifiedAt,
        })),
      }
    })().catch((error) => {
      cataloguePromise = null // ne pas mettre un échec en cache
      throw error
    })
  }
  return cataloguePromise
}

const EMPTY_STATE: UserState = { collection: [], wishlist: [] }

async function readUserState(): Promise<UserState> {
  try {
    const raw = JSON.parse(await readFile(USER_STATE_PATH, 'utf8')) as unknown
    return userStateSchema.parse(raw)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return EMPTY_STATE
    throw error
  }
}

/**
 * Sérialise les écritures : deux actions serveur concurrentes ne doivent pas
 * se recouvrir en lisant toutes les deux l'état d'avant.
 */
let writeQueue: Promise<unknown> = Promise.resolve()

function mutate(change: (state: UserState) => UserState): Promise<void> {
  const next = writeQueue.then(async () => {
    const state = await readUserState()
    const updated = change(state)
    await mkdir(dirname(USER_STATE_PATH), { recursive: true })
    const temporary = `${USER_STATE_PATH}.${randomUUID()}.tmp`
    await writeFile(temporary, `${JSON.stringify(updated, null, 2)}\n`, 'utf8')
    await rename(temporary, USER_STATE_PATH)
  })
  writeQueue = next.catch(() => undefined)
  return next
}

export class JsonRepository implements Repository {
  async listPerfumes(): Promise<Perfume[]> {
    return (await loadCatalogue()).perfumes
  }

  async getPerfume(id: string): Promise<Perfume | null> {
    return (await loadCatalogue()).perfumes.find((p) => p.id === id) ?? null
  }

  async searchPerfumes(query: string, limit = 20): Promise<Perfume[]> {
    const needle = normalizeTerm(query)
    if (needle.length === 0) return []
    const { perfumes } = await loadCatalogue()

    // Le classement privilégie le préfixe puis la sous-chaîne. Aucun repli
    // phonétique : mieux vaut zéro résultat qu'un mauvais parfum.
    const scored = perfumes
      .map((perfume) => {
        const haystack = normalizeTerm(`${perfume.brand} ${perfume.name}`)
        const name = normalizeTerm(perfume.name)
        if (name.startsWith(needle)) return { perfume, rank: 0 }
        if (haystack.startsWith(needle)) return { perfume, rank: 1 }
        if (haystack.includes(needle)) return { perfume, rank: 2 }
        return null
      })
      .filter((entry): entry is { perfume: Perfume; rank: number } => entry !== null)

    scored.sort(
      (a, b) =>
        a.rank - b.rank ||
        `${a.perfume.brand} ${a.perfume.name}`.localeCompare(`${b.perfume.brand} ${b.perfume.name}`),
    )
    return scored.slice(0, limit).map((entry) => entry.perfume)
  }

  async listDupeLinks(): Promise<DupeLink[]> {
    return (await loadCatalogue()).dupeLinks
  }

  async getCollection(userId: string): Promise<CollectionEntry[]> {
    return (await readUserState()).collection.filter((entry) => entry.userId === userId)
  }

  async getWishlist(userId: string): Promise<WishlistEntry[]> {
    return (await readUserState()).wishlist.filter((entry) => entry.userId === userId)
  }

  async upsertCollectionEntry(entry: CollectionEntry): Promise<void> {
    await mutate((state) => ({
      ...state,
      collection: [
        ...state.collection.filter(
          (item) => !(item.userId === entry.userId && item.perfumeId === entry.perfumeId),
        ),
        entry,
      ],
    }))
  }

  async removeCollectionEntry(userId: string, perfumeId: string): Promise<void> {
    await mutate((state) => ({
      ...state,
      collection: state.collection.filter(
        (item) => !(item.userId === userId && item.perfumeId === perfumeId),
      ),
    }))
  }

  async upsertWishlistEntry(entry: WishlistEntry): Promise<void> {
    await mutate((state) => ({
      ...state,
      wishlist: [
        ...state.wishlist.filter(
          (item) => !(item.userId === entry.userId && item.perfumeId === entry.perfumeId),
        ),
        entry,
      ],
    }))
  }

  async removeWishlistEntry(userId: string, perfumeId: string): Promise<void> {
    await mutate((state) => ({
      ...state,
      wishlist: state.wishlist.filter(
        (item) => !(item.userId === userId && item.perfumeId === perfumeId),
      ),
    }))
  }

  describe(): RepositoryInfo {
    return {
      kind: 'json',
      label: 'Fichiers locaux (data/)',
      warning:
        "Aucune base connectée : le catalogue provient de l'amorce manuelle non vérifiée et l'état utilisateur est écrit dans data/user-state.json.",
    }
  }
}

export { DEFAULT_USER_ID }
