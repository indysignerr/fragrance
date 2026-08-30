import 'server-only'

import { z } from 'zod'

import type { Perfume } from '@/lib/domain/types'
import { matchPerfumes, resolvePerfume, type MatchCandidate } from '@/lib/domain/matching'
import { completeJson, isAvailable, readKimiConfig } from './kimi'
import { splitInput } from './parse-input'

/**
 * Résolution d'une saisie en texte libre vers des parfums de la base.
 *
 * Architecture : le rapprochement est fait par le code, pas par le modèle. Kimi
 * n'intervient qu'en arbitre, et seulement quand plusieurs candidats de la base
 * restent à égalité. On lui soumet la liste fermée des candidats et il doit
 * renvoyer l'un de leurs identifiants — toute autre réponse est rejetée.
 *
 * Conséquence : le modèle ne peut structurellement pas inventer un parfum. Le
 * pire cas est qu'il choisisse mal parmi des candidats réels, ou qu'il rende
 * une valeur invalide, auquel cas on retombe sur la question à l'utilisateur.
 */

export interface ParsedLine {
  /** Le texte tel que saisi. */
  input: string
  status: 'resolu' | 'ambigu' | 'introuvable'
  perfume: Perfume | null
  candidates: MatchCandidate[]
  /** Qui a tranché. Toujours affiché : l'utilisateur doit pouvoir en douter. */
  decidedBy: 'code' | 'kimi' | null
  message: string
}

const choiceSchema = z.object({
  /** Identifiant choisi, ou null si le modèle ne sait pas trancher. */
  perfumeId: z.string().nullable(),
})

async function disambiguate(
  input: string,
  candidates: MatchCandidate[],
): Promise<{ perfume: Perfume; decidedBy: 'kimi' } | null> {
  const config = readKimiConfig()
  if (!config) return null

  const allowed = new Set(candidates.map((candidate) => candidate.perfume.id))
  const listing = candidates
    .map(
      (candidate) =>
        `- id: ${candidate.perfume.id} | ${candidate.perfume.brand} — ${candidate.perfume.name}${
          candidate.perfume.year ? ` (${candidate.perfume.year})` : ''
        }`,
    )
    .join('\n')

  try {
    const answer = await completeJson(
      config,
      [
        {
          role: 'system',
          content:
            "Tu choisis, dans une liste fermée, le parfum que désigne une saisie d'utilisateur. " +
            "Tu ne peux répondre qu'avec un identifiant présent dans la liste, ou null si aucun ne " +
            "correspond clairement. N'invente jamais d'identifiant, de marque ou de nom. " +
            'Réponds uniquement en JSON : {"perfumeId": "<id ou null>"}.',
        },
        { role: 'user', content: `Saisie : « ${input} »\n\nCandidats :\n${listing}` },
      ],
      choiceSchema,
      { maxTokens: 64 },
    )

    // Garde-fou : l'identifiant doit appartenir à l'ensemble soumis.
    if (!answer.perfumeId || !allowed.has(answer.perfumeId)) return null
    const chosen = candidates.find((candidate) => candidate.perfume.id === answer.perfumeId)
    return chosen ? { perfume: chosen.perfume, decidedBy: 'kimi' } : null
  } catch {
    // Une panne du modèle ne doit jamais empêcher l'utilisateur de saisir : on
    // retombe sur la question.
    return null
  }
}

export async function parseLine(input: string, catalogue: readonly Perfume[]): Promise<ParsedLine> {
  const resolution = resolvePerfume(input, catalogue)

  if (resolution.status === 'resolu') {
    return {
      input,
      status: 'resolu',
      perfume: resolution.perfume,
      candidates: resolution.candidates,
      decidedBy: 'code',
      message: `Reconnu : ${resolution.perfume.brand} — ${resolution.perfume.name}.`,
    }
  }

  if (resolution.status === 'introuvable') {
    return {
      input,
      status: 'introuvable',
      perfume: null,
      candidates: [],
      decidedBy: null,
      message:
        "Aucune correspondance dans la base. Rien n'a été deviné : ajoutez ce parfum au catalogue, ou reformulez.",
    }
  }

  const arbitrated = await disambiguate(input, resolution.candidates)
  if (arbitrated) {
    return {
      input,
      status: 'resolu',
      perfume: arbitrated.perfume,
      candidates: resolution.candidates,
      decidedBy: 'kimi',
      message: `Kimi a tranché entre ${resolution.candidates.length} candidats de la base : ${arbitrated.perfume.brand} — ${arbitrated.perfume.name}. Vérifiez.`,
    }
  }

  return {
    input,
    status: 'ambigu',
    perfume: null,
    candidates: resolution.candidates,
    decidedBy: null,
    message: isAvailable()
      ? 'Plusieurs parfums de la base correspondent et Kimi n’a pas su trancher. Choisissez.'
      : 'Plusieurs parfums de la base correspondent. Choisissez — rien ne sera deviné à votre place.',
  }
}

export async function parseInput(input: string, catalogue: readonly Perfume[]): Promise<ParsedLine[]> {
  const lines = splitInput(input)
  return Promise.all(lines.map((line) => parseLine(line, catalogue)))
}

export { matchPerfumes, splitInput }
