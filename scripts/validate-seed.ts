/**
 * Valide un fichier d'amorce avant qu'il n'entre dans la base.
 *
 * Refuse tout identifiant hors vocabulaire plutôt que de le rapprocher du
 * terme le plus proche : une note mal orthographiée doit être corrigée à la
 * main, pas devinée.
 */
import { readFileSync } from 'node:fs'

import { seedFileSchema } from '@/lib/data/seed-format'
import { NOTE_INDEX, ACCORD_INDEX, resolveNoteId, resolveAccordId } from '@/lib/domain/vocabulary'

const path = process.argv[2] ?? 'data/seed/catalogue.json'
const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown

const parsed = seedFileSchema.safeParse(raw)

if (!parsed.success) {
  console.error(`✖ ${path} : ${parsed.error.issues.length} problème(s)\n`)
  for (const issue of parsed.error.issues) {
    const where = issue.path.join('.')
    const value = issue.path.reduce<unknown>(
      (acc, key) => (acc as Record<string, unknown> | undefined)?.[key as string],
      raw,
    )
    let hint = ''
    if (typeof value === 'string') {
      // On indique la forme canonique quand le terme existe sous un synonyme,
      // mais on ne corrige jamais automatiquement.
      const asNote = NOTE_INDEX.has(value) ? null : resolveNoteId(value)
      const asAccord = ACCORD_INDEX.has(value) ? null : resolveAccordId(value)
      if (asNote) hint = ` → synonyme connu, id canonique « ${asNote} »`
      else if (asAccord) hint = ` → accord canonique « ${asAccord} »`
      else hint = ' → absent du vocabulaire, à ajouter ou à retirer'
    }
    console.error(`  ${where}: ${issue.message}${typeof value === 'string' ? ` (« ${value} »)` : ''}${hint}`)
  }
  process.exit(1)
}

const { perfumes, dupeLinks } = parsed.data
const ids = new Set<string>()
const problems: string[] = []

for (const perfume of perfumes) {
  if (ids.has(perfume.id)) problems.push(`identifiant en double : ${perfume.id}`)
  ids.add(perfume.id)
  const total = perfume.notes.tete.length + perfume.notes.coeur.length + perfume.notes.fond.length
  if (total === 0) problems.push(`${perfume.id} : aucune note, le parfum serait invisible du moteur`)
}

for (const link of dupeLinks) {
  if (!ids.has(link.perfumeOriginalId)) problems.push(`dupe ${link.id} : original inconnu ${link.perfumeOriginalId}`)
  if (!ids.has(link.perfumeCloneId)) problems.push(`dupe ${link.id} : clone inconnu ${link.perfumeCloneId}`)
  if (link.confidence > 0 && link.sources.length === 0) {
    problems.push(`dupe ${link.id} : confiance ${link.confidence} revendiquée sans aucune source`)
  }
}

if (problems.length > 0) {
  console.error(`✖ ${path}\n${problems.map((p) => `  ${p}`).join('\n')}`)
  process.exit(1)
}

console.log(`✓ ${path} — ${perfumes.length} parfums, ${dupeLinks.length} correspondances, vocabulaire respecté`)
