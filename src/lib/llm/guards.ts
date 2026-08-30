import type { Perfume } from '@/lib/domain/types'
import { normalizeTerm } from '@/lib/domain/vocabulary'

/**
 * Garde-fous appliqués à toute prose engendrée par le modèle.
 *
 * Volontairement hors du module serveur : ce sont des fonctions pures, et elles
 * doivent être testables sans réseau ni environnement React.
 */

/** Nombres cités dans un texte, normalisés pour la comparaison. */
export function numbersIn(text: string): string[] {
  return [...text.matchAll(/\d+(?:[.,]\d+)?/g)].map((match) => match[0].replace(',', '.'))
}

/**
 * Nombres avancés par le texte qui n'apparaissent pas dans les faits fournis.
 * La contrainte « aucun chiffre sans source » vaut aussi pour la reformulation.
 */
export function inventedNumbers(text: string, facts: string): string[] {
  const allowed = new Set(numbersIn(facts))
  return numbersIn(text).filter((value) => !allowed.has(value))
}

/**
 * Parfums de la base cités par le texte alors qu'ils ne sont pas autorisés.
 * On teste le nom complet « marque + nom », et le nom seul s'il est assez long
 * pour ne pas déclencher de faux positifs.
 */
export function foreignMentions(
  text: string,
  catalogue: readonly Perfume[],
  allowedIds: ReadonlySet<string>,
): string[] {
  const haystack = normalizeTerm(text)
  const found: string[] = []
  for (const perfume of catalogue) {
    if (allowedIds.has(perfume.id)) continue
    const fullName = normalizeTerm(`${perfume.brand} ${perfume.name}`)
    const name = normalizeTerm(perfume.name)
    if (haystack.includes(fullName) || (name.length >= 6 && haystack.includes(name))) {
      found.push(`${perfume.brand} — ${perfume.name}`)
    }
  }
  return found
}
