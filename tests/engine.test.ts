import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { BLEND_WEIGHTS, buildPerfumeVector, dot, fromPgVector, toPgVector } from '@/lib/domain/vector'
import { compare, similarity, vectorOf } from '@/lib/domain/similarity'
import { analyzeRedundancy, REDUNDANCY_THRESHOLDS, verdictFor } from '@/lib/domain/redundancy'
import { buildCoverageGrid, gapFit } from '@/lib/domain/coverage'
import { affinity, buildTasteProfile } from '@/lib/domain/taste'
import { recommend } from '@/lib/domain/recommend'
import { assessDupe, sortAssessments } from '@/lib/domain/dupes'
import { suggestLayering } from '@/lib/domain/layering'
import { resolveNoteId } from '@/lib/domain/vocabulary'
import type { DupeLink, Perfume } from '@/lib/domain/types'
import { accord, note, owns, perfume, wishes } from './factories'

const woodyAmber = perfume('woody-amber', {
  notes: [note('bergamote', 'tete'), note('cedre', 'coeur'), note('ambroxan', 'fond'), note('santal', 'fond')],
  accords: [accord('boise'), accord('ambre')],
  seasons: ['automne', 'hiver'],
  moments: ['soir'],
  intensity: 'puissant',
})

const woodyAmberTwin = perfume('woody-amber-twin', {
  notes: [note('bergamote', 'tete'), note('cedre', 'coeur'), note('ambroxan', 'fond'), note('santal', 'fond')],
  accords: [accord('boise'), accord('ambre')],
  seasons: ['automne', 'hiver'],
  moments: ['soir'],
  intensity: 'puissant',
})

const aquatic = perfume('aquatic', {
  notes: [note('citron', 'tete'), note('notes-marines', 'coeur'), note('musc-blanc', 'fond')],
  accords: [accord('aquatique'), accord('frais')],
  seasons: ['ete'],
  moments: ['jour'],
  intensity: 'discret',
})

const gourmandAmber = perfume('gourmand-amber', {
  notes: [note('vanille', 'fond'), note('feve-tonka', 'fond'), note('mandarine', 'tete'), note('ambre', 'fond')],
  accords: [accord('gourmand'), accord('ambre'), accord('vanille')],
  seasons: ['hiver'],
  moments: ['soir'],
  intensity: 'modere',
})

/** Proche du boisé possédé sans en être un doublon : sert à départager les deux modes. */
const woodyCousin = perfume('woody-cousin', {
  notes: [note('pamplemousse', 'tete'), note('cedre', 'coeur'), note('musc-blanc', 'fond'), note('vetiver', 'fond')],
  accords: [accord('boise'), accord('musc')],
  seasons: ['automne', 'hiver'],
  moments: ['soir'],
  intensity: 'puissant',
})

describe('vocabulaire', () => {
  it('résout les synonymes vers un id canonique', () => {
    assert.equal(resolveNoteId('Bergamot'), 'bergamote')
    assert.equal(resolveNoteId('  OAKMOSS '), 'mousse-de-chene')
  })

  it("retourne null hors vocabulaire plutôt que de deviner", () => {
    assert.equal(resolveNoteId('essence de licorne'), null)
    assert.equal(resolveNoteId(''), null)
  })
})

describe('vecteurs', () => {
  it('répartit un poids total de 1 entre les trois espaces', () => {
    const total = BLEND_WEIGHTS.notes + BLEND_WEIGHTS.accords + BLEND_WEIGHTS.facets
    assert.ok(Math.abs(total - 1) < 1e-12)
  })

  it('produit un vecteur combiné unitaire', () => {
    const { combined } = buildPerfumeVector(woodyAmber)
    assert.ok(Math.abs(Math.sqrt(dot(combined, combined)) - 1) < 1e-9)
  })

  it('fait coïncider le produit scalaire du vecteur combiné et la similarité mixte', () => {
    // Invariant central : c'est ce qui permet à pgvector de rendre exactement
    // le même score que le calcul TypeScript.
    const viaDot = dot(vectorOf(woodyAmber).combined, vectorOf(gourmandAmber).combined)
    assert.ok(Math.abs(compare(woodyAmber, gourmandAmber).score - viaDot) < 1e-12)
  })

  it('survit à un aller-retour pgvector', () => {
    const original = vectorOf(aquatic).combined
    const round = fromPgVector(toPgVector(original))
    assert.equal(round.length, original.length)
    assert.ok(Math.abs(dot(original, round) - 1) < 1e-4)
  })

  it('signale un vecteur approximé quand la source ne pondère pas les notes', () => {
    assert.equal(buildPerfumeVector(woodyAmber).approximated, true)
    const weighted = perfume('weighted', {
      notes: [note('rose', 'fond', 1)],
      accords: [accord('floral', 1)],
    })
    assert.equal(buildPerfumeVector(weighted).approximated, false)
  })

  it('ignore une note hors vocabulaire au lieu de l’inventer', () => {
    const withGhost = perfume('ghost', { notes: [note('rose', 'fond', 1), note('licorne', 'fond', 1)] })
    const withoutGhost = perfume('clean', { notes: [note('rose', 'fond', 1)] })
    assert.ok(similarity(withGhost, withoutGhost) > 0.99)
  })
})

describe('similarité', () => {
  it('vaut 1 pour un parfum comparé à lui-même', () => {
    assert.ok(Math.abs(similarity(woodyAmber, woodyAmber) - 1) < 1e-12)
  })

  it('est symétrique', () => {
    assert.ok(Math.abs(similarity(woodyAmber, aquatic) - similarity(aquatic, woodyAmber)) < 1e-12)
  })

  it('rapproche deux boisés secs sans note commune, via les facettes', () => {
    const cedar = perfume('cedar', { notes: [note('cedre', 'fond', 1)], accords: [accord('boise', 1)] })
    const vetiver = perfume('vetiver', { notes: [note('vetiver', 'fond', 1)], accords: [accord('boise', 1)] })
    const breakdown = compare(cedar, vetiver)
    assert.equal(breakdown.sharedNotes.length, 0)
    assert.equal(breakdown.facetScore, 1)
    assert.ok(breakdown.score > 0.5, `attendu > 0.5, obtenu ${breakdown.score}`)
  })

  it("ne compte pas un axe non sourcé comme une divergence", () => {
    // Deux parfums identiques dont aucun ne documente ses accords : la
    // comparaison doit porter sur notes + facettes et conclure à l'identité,
    // pas amputer le score du poids des accords manquants.
    const left = perfume('sans-accords-a', { notes: [note('rose', 'fond', 1)] })
    const right = perfume('sans-accords-b', { notes: [note('rose', 'fond', 1)] })
    const breakdown = compare(left, right)
    assert.deepEqual(breakdown.comparableAxes, ['notes', 'facets'])
    assert.ok(Math.abs(breakdown.score - 1) < 1e-12, `attendu 1, obtenu ${breakdown.score}`)
  })

  it('sépare ce que chaque parfum apporte en propre', () => {
    const breakdown = compare(woodyAmber, aquatic)
    assert.ok(breakdown.onlyA.some((n) => n.noteId === 'cedre'))
    assert.ok(breakdown.onlyB.some((n) => n.noteId === 'notes-marines'))
    assert.equal(breakdown.sharedNotes.length, 0)
  })
})

describe('redondance', () => {
  it('classe un jumeau comme redondant', () => {
    const report = analyzeRedundancy(woodyAmberTwin, [woodyAmber, aquatic])
    assert.equal(report.verdict, 'redondant')
    assert.equal(report.closest?.owned.id, 'woody-amber')
    assert.ok(report.closest!.breakdown.score >= REDUNDANCY_THRESHOLDS.redondant)
  })

  it('classe un parfum éloigné comme complémentaire', () => {
    assert.equal(analyzeRedundancy(aquatic, [woodyAmber]).verdict, 'complementaire')
  })

  it('ne se compare pas à lui-même', () => {
    const report = analyzeRedundancy(woodyAmber, [woodyAmber])
    assert.equal(report.comparedCount, 0)
    assert.equal(report.closest, null)
  })

  it('propage l’incertitude quand un vecteur est approximé', () => {
    assert.equal(analyzeRedundancy(woodyAmberTwin, [woodyAmber]).uncertain, true)
  })

  it('applique les seuils annoncés', () => {
    assert.equal(verdictFor(0.81), 'redondant')
    assert.equal(verdictFor(0.7), 'chevauchement')
    assert.equal(verdictFor(0.3), 'complementaire')
  })
})

describe('grille de couverture', () => {
  it('place un parfum sur toutes ses combinaisons saison × moment', () => {
    const grid = buildCoverageGrid([woodyAmber])
    const filled = grid.cells.filter((c) => c.perfumeIds.length > 0)
    assert.equal(filled.length, 2) // 2 saisons × 1 moment × 1 intensité
    assert.equal(grid.placedCount, 1)
  })

  it('écarte un parfum sans axe sourcé au lieu de le supposer', () => {
    const vague = perfume('vague', { notes: [note('rose', 'fond', 1)] })
    const grid = buildCoverageGrid([vague])
    assert.equal(grid.placedCount, 0)
    assert.deepEqual(grid.unplaceable[0].missing, ['saison', 'moment', 'intensité'])
  })

  it('marque une case saturée à partir du seuil', () => {
    const clones = [1, 2, 3].map((i) => perfume(`c${i}`, { seasons: ['hiver'], moments: ['soir'], intensity: 'puissant' }))
    const grid = buildCoverageGrid(clones)
    assert.equal(grid.saturated.length, 1)
    assert.equal(grid.saturated[0].season, 'hiver')
  })

  it('ne calcule aucun bénéfice de couverture pour un parfum non plaçable', () => {
    const grid = buildCoverageGrid([woodyAmber])
    assert.equal(gapFit(perfume('vague'), grid), null)
    assert.equal(gapFit(aquatic, grid), 1) // été/jour/discret est vide
  })
})

describe('profil de goût', () => {
  const byId = new Map<string, Perfume>([[woodyAmber.id, woodyAmber], [aquatic.id, aquatic], [gourmandAmber.id, gourmandAmber]])

  it('pèse la wishlist plus lourd que la collection', () => {
    const fromCollection = buildTasteProfile(byId, [owns(woodyAmber.id)], [wishes(aquatic.id)])
    const wishWeight = fromCollection.contributions.find((c) => c.origin === 'wishlist')!.weight
    const ownWeight = fromCollection.contributions.find((c) => c.origin === 'collection')!.weight
    assert.ok(wishWeight > ownWeight, `wishlist ${wishWeight} doit dépasser collection ${ownWeight}`)
  })

  it('atténue un souhait jamais senti', () => {
    const smelled = buildTasteProfile(byId, [], [wishes(aquatic.id, 'adore', true)])
    const unsmelled = buildTasteProfile(byId, [], [wishes(aquatic.id, 'adore', false)])
    assert.ok(unsmelled.contributions[0].weight < smelled.contributions[0].weight)
  })

  it('penche du côté de la wishlist quand les deux s’opposent', () => {
    const profile = buildTasteProfile(byId, [owns(woodyAmber.id)], [wishes(aquatic.id, 'adore', true)])
    assert.ok(affinity(profile, aquatic) > affinity(profile, woodyAmber))
  })

  it('rend un profil vide sans données, sans inventer de centroïde', () => {
    const empty = buildTasteProfile(byId, [], [])
    assert.equal(empty.centroid, null)
    assert.equal(empty.confidence, 0)
    assert.equal(affinity(empty, woodyAmber), 0)
  })

  it('expose les notes dominantes du profil', () => {
    const profile = buildTasteProfile(byId, [owns(gourmandAmber.id)], [])
    assert.ok(profile.topNotes.some((n) => n.id === 'vanille'))
    assert.ok(profile.topAccords.some((a) => a.id === 'gourmand'))
  })
})

describe('recommandations', () => {
  const catalogue = [woodyAmber, woodyAmberTwin, aquatic, gourmandAmber]
  const byId = new Map(catalogue.map((p) => [p.id, p]))

  it('n’propose jamais un doublon d’un flacon possédé', () => {
    const profile = buildTasteProfile(byId, [owns(woodyAmber.id)], [])
    const grid = buildCoverageGrid([woodyAmber])
    const result = recommend(catalogue, [woodyAmber], profile, grid, {
      mode: 'reste-dans-ce-que-jaime',
      excludeIds: new Set([woodyAmber.id]),
      affinityFloor: 0,
    })
    assert.ok(!result.items.some((i) => i.perfume.id === woodyAmberTwin.id))
    assert.ok(result.rejected.some((r) => r.perfumeId === woodyAmberTwin.id && r.reason.includes('redondant')))
  })

  it('inverse le classement selon le mode', () => {
    // woodyCousin : proche du flacon possédé, donc très « dans le profil »,
    // mais il n'ouvre aucun créneau neuf.
    // gourmandAmber : plus lointain, moins dans le profil, mais il remplit
    // des cases vides de la grille.
    const pool = [woodyAmber, woodyCousin, gourmandAmber]
    const profile = buildTasteProfile(new Map(pool.map((p) => [p.id, p])), [owns(woodyAmber.id)], [])
    const grid = buildCoverageGrid([woodyAmber])
    const exclude = new Set([woodyAmber.id])
    const gap = recommend(pool, [woodyAmber], profile, grid, { mode: 'comble-un-trou', excludeIds: exclude, affinityFloor: 0 })
    const same = recommend(pool, [woodyAmber], profile, grid, { mode: 'reste-dans-ce-que-jaime', excludeIds: exclude, affinityFloor: 0 })
    assert.equal(gap.items[0].perfume.id, gourmandAmber.id)
    assert.equal(same.items[0].perfume.id, woodyCousin.id)
  })

  it('est déterministe', () => {
    const profile = buildTasteProfile(byId, [owns(woodyAmber.id)], [])
    const grid = buildCoverageGrid([woodyAmber])
    const run = () => recommend(catalogue, [woodyAmber], profile, grid, { mode: 'comble-un-trou', affinityFloor: 0 }).items.map((i) => `${i.perfume.id}:${i.score.toFixed(12)}`)
    assert.deepEqual(run(), run())
  })

  it('produit une justification chiffrée sans LLM', () => {
    const profile = buildTasteProfile(byId, [owns(woodyAmber.id)], [])
    const grid = buildCoverageGrid([woodyAmber])
    const result = recommend(catalogue, [woodyAmber], profile, grid, { mode: 'comble-un-trou', affinityFloor: 0 })
    assert.match(result.items[0].rationale, /affinité avec votre profil \d+ %/)
  })
})

describe('dupes', () => {
  const byId = new Map<string, Perfume>([[woodyAmber.id, woodyAmber], [woodyAmberTwin.id, woodyAmberTwin], [aquatic.id, aquatic]])
  const link = (overrides: Partial<DupeLink>): DupeLink => ({
    id: 'l', perfumeOriginalId: woodyAmber.id, perfumeCloneId: woodyAmberTwin.id,
    confidence: 0.9, sources: [], verifiedAt: null, ...overrides,
  })

  it('classe une attribution sans source en « non sourcé » et annule sa confiance', () => {
    const assessment = assessDupe(link({ sources: [] }), byId)
    assert.equal(assessment.tier, 'non-source')
    assert.equal(assessment.effectiveConfidence, 0)
    assert.equal(assessment.cappedBySources, true)
  })

  it('plafonne une confiance revendiquée par la qualité de la source', () => {
    const assessment = assessDupe(link({ confidence: 0.95, sources: [{ type: 'communaute', url: 'https://example.org/t/1', label: 'Forum' }] }), byId)
    assert.ok(assessment.effectiveConfidence <= 0.35)
    assert.equal(assessment.tier, 'rumeur')
  })

  it('ne déclare « vérifié » qu’avec une source forte et une date de vérification', () => {
    const strong = { type: 'marque' as const, url: 'https://example.com', label: 'Maison' }
    assert.equal(assessDupe(link({ sources: [strong], verifiedAt: null }), byId).tier, 'probable')
    assert.equal(assessDupe(link({ sources: [strong], verifiedAt: '2026-01-01' }), byId).tier, 'verifie')
  })

  it('signale une attribution contredite par les compositions', () => {
    const assessment = assessDupe(link({ perfumeCloneId: aquatic.id, confidence: 0.9, sources: [{ type: 'marque', url: 'https://example.com', label: 'M' }], verifiedAt: '2026-01-01' }), byId)
    assert.equal(assessment.contradicts, true)
    assert.ok(assessment.measuredSimilarity! < 0.45)
  })

  it('relègue toujours le non-sourcé en dernier', () => {
    const items = [
      assessDupe(link({ id: 'a', sources: [] }), byId),
      assessDupe(link({ id: 'b', sources: [{ type: 'communaute', url: 'https://x', label: 'F' }] }), byId),
    ]
    assert.equal(sortAssessments(items).at(-1)!.link.id, 'a')
  })
})

describe('layering', () => {
  it('écarte deux parfums trop proches et deux parfums trop éloignés', () => {
    assert.equal(suggestLayering([woodyAmber, woodyAmberTwin]).length, 0)
    assert.equal(suggestLayering([woodyAmber, aquatic]).length, 0)
  })

  it('propose une paire dans la bande utile avec un socle commun', () => {
    const suggestions = suggestLayering([woodyAmber, gourmandAmber])
    assert.equal(suggestions.length, 1)
    assert.ok(suggestions[0].anchors.includes('ambree'))
    assert.ok(suggestions[0].similarity >= 0.22 && suggestions[0].similarity <= 0.62)
  })

  it('met le plus puissant en retrait dans le dosage', () => {
    const [suggestion] = suggestLayering([woodyAmber, gourmandAmber])
    // woodyAmber est « puissant » (3), gourmandAmber « modéré » (2) : rapport inversé.
    assert.deepEqual(suggestion.ratio, { a: 2, b: 3 })
    assert.match(suggestion.ratioNote, /puissant/)
  })

  it('refuse de calculer un dosage sans intensité sourcée', () => {
    const unknown = perfume('unknown-intensity', {
      notes: gourmandAmber.notes, accords: gourmandAmber.accords, seasons: ['hiver'], moments: ['soir'], intensity: null,
    })
    const [suggestion] = suggestLayering([woodyAmber, unknown])
    assert.equal(suggestion.ratio, null)
    assert.match(suggestion.ratioNote, /non sourcée/)
  })
})
