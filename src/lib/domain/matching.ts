import type { Perfume } from './types'
import { normalizeTerm } from './vocabulary'

/**
 * Rapprochement d'un texte libre vers des parfums de la base.
 *
 * Entièrement déterministe et local. Il ne rend jamais un « meilleur effort » :
 * en dessous du seuil, la liste est vide et l'appelant doit demander à
 * l'utilisateur plutôt que de trancher.
 */

export interface MatchCandidate {
  perfume: Perfume
  /** Score de rapprochement, 0–1. */
  score: number
  /** Ce qui a déclenché le rapprochement, pour pouvoir l'expliquer. */
  reason: 'exact' | 'prefixe' | 'sous-chaine' | 'approchant'
}

/** Seuil sous lequel un candidat n'est même pas proposé. */
export const MATCH_FLOOR = 0.45
/** Écart minimal entre le premier et le deuxième pour trancher sans demander. */
export const UNAMBIGUOUS_MARGIN = 0.15

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  let previous = new Array<number>(b.length + 1)
  let current = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j++) previous[j] = j

  for (let i = 1; i <= a.length; i++) {
    current[0] = i
    for (let j = 1; j <= b.length; j++) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, substitution)
    }
    const swap = previous
    previous = current
    current = swap
  }
  return previous[b.length]
}

function ratio(a: string, b: string): number {
  const longest = Math.max(a.length, b.length)
  if (longest === 0) return 1
  return 1 - levenshtein(a, b) / longest
}

export function matchPerfumes(
  query: string,
  catalogue: readonly Perfume[],
  limit = 5,
): MatchCandidate[] {
  const needle = normalizeTerm(query)
  if (needle.length < 2) return []

  const candidates: MatchCandidate[] = []

  for (const perfume of catalogue) {
    const name = normalizeTerm(perfume.name)
    const full = normalizeTerm(`${perfume.brand} ${perfume.name}`)

    let score: number
    let reason: MatchCandidate['reason']

    if (needle === name || needle === full) {
      score = 1
      reason = 'exact'
    } else if (full.startsWith(needle) || name.startsWith(needle)) {
      // Un préfixe long est plus discriminant qu'un préfixe court.
      score = 0.75 + 0.2 * Math.min(1, needle.length / Math.max(4, name.length))
      reason = 'prefixe'
    } else if (full.includes(needle)) {
      score = 0.6 + 0.15 * Math.min(1, needle.length / full.length)
      reason = 'sous-chaine'
    } else {
      // Dernier recours : distance d'édition, pour absorber les fautes de frappe.
      score = Math.max(ratio(needle, name), ratio(needle, full))
      reason = 'approchant'
    }

    if (score >= MATCH_FLOOR) candidates.push({ perfume, score, reason })
  }

  candidates.sort(
    (a, b) =>
      b.score - a.score ||
      `${a.perfume.brand} ${a.perfume.name}`.localeCompare(`${b.perfume.brand} ${b.perfume.name}`),
  )
  return candidates.slice(0, limit)
}

export type Resolution =
  | { status: 'resolu'; perfume: Perfume; candidates: MatchCandidate[] }
  | { status: 'ambigu'; candidates: MatchCandidate[] }
  | { status: 'introuvable'; candidates: [] }

/**
 * Tranche seul quand c'est net, rend la main sinon.
 *
 * Le mode `ambigu` n'est pas un échec : c'est le comportement voulu. Deviner
 * entre deux flacons reviendrait à fausser silencieusement la collection.
 */
export function resolvePerfume(query: string, catalogue: readonly Perfume[]): Resolution {
  const candidates = matchPerfumes(query, catalogue)
  if (candidates.length === 0) return { status: 'introuvable', candidates: [] }

  const [first, second] = candidates
  if (first.reason === 'exact' && (!second || second.reason !== 'exact')) {
    return { status: 'resolu', perfume: first.perfume, candidates }
  }
  if (!second || first.score - second.score >= UNAMBIGUOUS_MARGIN) {
    return { status: 'resolu', perfume: first.perfume, candidates }
  }
  return { status: 'ambigu', candidates }
}
