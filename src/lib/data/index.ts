import 'server-only'

import { JsonRepository } from './json-repository'
import { PostgresRepository } from './postgres-repository'
import { DEFAULT_USER_ID, type Repository } from './repository'

/**
 * Sélection du dépôt.
 *
 * `DATABASE_URL` présent → Postgres. Sinon, fichiers locaux. Le choix est
 * affiché dans l'interface : l'utilisateur doit savoir d'où viennent les
 * données qu'il regarde.
 */
let instance: Repository | null = null

export function getRepository(): Repository {
  if (!instance) {
    const url = process.env.DATABASE_URL
    instance = url ? new PostgresRepository(url) : new JsonRepository()
  }
  return instance
}

export { DEFAULT_USER_ID }
export type { Repository, RepositoryInfo } from './repository'
