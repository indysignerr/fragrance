import { z } from 'zod'

import {
  ACCORD_INDEX,
  FACET_INDEX,
  NOTE_INDEX,
} from '@/lib/domain/vocabulary'
import type { Perfume, PerfumeNote, Provenance, Source } from '@/lib/domain/types'

/**
 * Format d'amorce.
 *
 * Volontairement plus compact que le modèle interne : la pyramide s'écrit en
 * trois listes d'identifiants, et l'expansion produit des `PerfumeNote` sans
 * poids déclaré. C'est exact — une saisie manuelle ne hiérarchise pas les notes
 * à l'intérieur d'un étage — et le moteur marquera les vecteurs correspondants
 * comme approximés.
 */

const noteId = z.string().refine((id) => NOTE_INDEX.has(id), {
  message: 'note hors vocabulaire',
})
const accordId = z.string().refine((id) => ACCORD_INDEX.has(id), {
  message: 'accord hors vocabulaire',
})
const facetId = z.string().refine((id) => FACET_INDEX.has(id), {
  message: 'facette hors vocabulaire',
})

export const sourceSchema = z.object({
  type: z.enum(['marque', 'revendeur', 'communaute', 'seed-manuel']),
  url: z.string().url().nullable(),
  label: z.string().min(1),
})

export const seedPerfumeSchema = z.object({
  id: z.string().min(1),
  brand: z.string().min(1),
  name: z.string().min(1),
  year: z.number().int().min(1700).max(2100).nullable(),
  concentration: z.enum([
    'eau-de-cologne',
    'eau-de-toilette',
    'eau-de-parfum',
    'extrait',
    'inconnue',
  ]),
  perfumers: z.array(z.string()).default([]),
  notes: z.object({
    tete: z.array(noteId).default([]),
    coeur: z.array(noteId).default([]),
    fond: z.array(noteId).default([]),
  }),
  accords: z.array(accordId).default([]),
  family: facetId.nullable(),
  seasons: z.array(z.enum(['printemps', 'ete', 'automne', 'hiver'])).default([]),
  moments: z.array(z.enum(['jour', 'soir'])).default([]),
  intensity: z.enum(['discret', 'modere', 'puissant']).nullable(),
})

export const seedDupeSchema = z.object({
  id: z.string().min(1),
  perfumeOriginalId: z.string().min(1),
  perfumeCloneId: z.string().min(1),
  confidence: z.number().min(0).max(1),
  sources: z.array(sourceSchema).default([]),
  verifiedAt: z.string().nullable(),
})

export const seedFileSchema = z.object({
  /** Provenance appliquée à tous les enregistrements du fichier. */
  provenance: z.object({
    sources: z.array(sourceSchema),
    collectedAt: z.string().nullable(),
    verifiedAt: z.string().nullable(),
  }),
  perfumes: z.array(seedPerfumeSchema),
  dupeLinks: z.array(seedDupeSchema).default([]),
})

export type SeedPerfume = z.infer<typeof seedPerfumeSchema>
export type SeedFile = z.infer<typeof seedFileSchema>

/** Développe une amorce vers le modèle interne. Les poids restent `null`. */
export function expandPerfume(seed: SeedPerfume, provenance: Provenance): Perfume {
  const notes: PerfumeNote[] = [
    ...seed.notes.tete.map((noteIdValue) => ({ noteId: noteIdValue, level: 'tete' as const, weight: null })),
    ...seed.notes.coeur.map((noteIdValue) => ({ noteId: noteIdValue, level: 'coeur' as const, weight: null })),
    ...seed.notes.fond.map((noteIdValue) => ({ noteId: noteIdValue, level: 'fond' as const, weight: null })),
  ]

  return {
    id: seed.id,
    brand: seed.brand,
    name: seed.name,
    year: seed.year,
    concentration: seed.concentration,
    perfumers: seed.perfumers,
    notes,
    accords: seed.accords.map((accordIdValue) => ({ accordId: accordIdValue, strength: null })),
    family: seed.family,
    seasons: seed.seasons,
    moments: seed.moments,
    intensity: seed.intensity,
    provenance,
  }
}

export const SEED_SOURCE: Source = {
  type: 'seed-manuel',
  url: null,
  label: 'Amorce saisie à la main — non vérifiée',
}
