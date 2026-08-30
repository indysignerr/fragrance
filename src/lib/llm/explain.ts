import 'server-only'

import type { Perfume } from '@/lib/domain/types'
import { foreignMentions, inventedNumbers } from './guards'
import { completeText, readKimiConfig } from './kimi'

/**
 * Rédaction de l'explication d'un résultat DÉJÀ calculé.
 *
 * Kimi ne reçoit que des faits produits par le moteur et n'a le droit de rien
 * ajouter. Deux vérifications mécaniques s'appliquent à sa sortie avant
 * affichage ; si l'une échoue, on rend le texte déterministe et on le dit.
 *
 *  1. Aucun parfum de la base absent de la liste blanche ne doit être cité.
 *  2. Aucun nombre absent des faits fournis ne doit apparaître — la contrainte
 *     « aucun chiffre sans source » s'applique aussi au texte engendré.
 *
 * Limite assumée : un nom entièrement inventé, qui ne figure dans aucune base,
 * échappe à la première vérification. C'est pourquoi l'interface n'affiche
 * jamais un parfum depuis ce texte : les fiches cliquables viennent toutes du
 * moteur, et cette prose reste du commentaire.
 */

export interface ExplanationFacts {
  /** Faits chiffrés et nommés, engendrés par le moteur. */
  lines: string[]
  /** Parfums que le texte a le droit de nommer. */
  allowed: readonly Perfume[]
  /** Consigne de cadrage propre au cas d'usage. */
  brief: string
}

export interface Explanation {
  text: string
  /** `kimi` si le texte vient du modèle et a passé les vérifications. */
  source: 'moteur' | 'kimi'
  /** Renseigné quand une sortie du modèle a été rejetée. */
  rejection: string | null
}

/** Repli déterministe : la juxtaposition des faits, toujours disponible. */
export function deterministicExplanation(facts: ExplanationFacts): Explanation {
  return { text: facts.lines.join(' '), source: 'moteur', rejection: null }
}

export async function explain(
  facts: ExplanationFacts,
  catalogue: readonly Perfume[],
): Promise<Explanation> {
  const config = readKimiConfig()
  if (!config) return deterministicExplanation(facts)

  const allowedIds = new Set(facts.allowed.map((perfume) => perfume.id))
  const allowedNames = facts.allowed.map((p) => `${p.brand} — ${p.name}`).join(' ; ')
  const factBlock = facts.lines.map((line) => `- ${line}`).join('\n')

  try {
    const text = await completeText(
      config,
      [
        {
          role: 'system',
          content:
            "Tu reformules en français des constats déjà calculés, pour un utilisateur qui gère sa collection de parfums. " +
            "Règles absolues : n'ajoute aucun fait, aucun chiffre et aucun nom de parfum qui ne soit pas dans les données fournies ; " +
            "ne cite que les parfums listés comme autorisés ; ne recommande rien qui ne soit pas dans les données ; " +
            "n'invente aucune note ni aucune marque. Deux à quatre phrases, ton direct, pas de formule d'introduction.",
        },
        {
          role: 'user',
          content: `Cadre : ${facts.brief}\n\nParfums qu'il est permis de nommer : ${allowedNames}\n\nConstats calculés :\n${factBlock}`,
        },
      ],
      { maxTokens: 320 },
    )

    const intruders = foreignMentions(text, catalogue, allowedIds)
    if (intruders.length > 0) {
      return {
        ...deterministicExplanation(facts),
        rejection: `Texte de Kimi écarté : il citait ${intruders.join(', ')}, hors des parfums fournis.`,
      }
    }

    const invented = inventedNumbers(text, facts.lines.join(' '))
    if (invented.length > 0) {
      return {
        ...deterministicExplanation(facts),
        rejection: `Texte de Kimi écarté : il avançait des chiffres absents des constats (${invented.join(', ')}).`,
      }
    }

    return { text, source: 'kimi', rejection: null }
  } catch (error) {
    return {
      ...deterministicExplanation(facts),
      rejection: `Kimi injoignable (${error instanceof Error ? error.message : 'erreur inconnue'}).`,
    }
  }
}
