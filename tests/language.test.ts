import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { MATCH_FLOOR, matchPerfumes, resolvePerfume } from '@/lib/domain/matching'
import { foreignMentions, inventedNumbers, numbersIn } from '@/lib/llm/guards'
import { splitInput } from '@/lib/llm/parse-input'
import { perfume } from './factories'

const catalogue = [
  perfume('creed-aventus', { brand: 'Creed', name: 'Aventus' }),
  perfume('armaf-cdnim', { brand: 'Armaf', name: 'Club de Nuit Intense Man' }),
  perfume('dior-sauvage-edt', { brand: 'Dior', name: 'Sauvage' }),
  perfume('dior-eau-sauvage', { brand: 'Dior', name: 'Eau Sauvage' }),
  perfume('dior-homme-intense', { brand: 'Dior', name: 'Homme Intense' }),
]

describe('rapprochement de texte libre', () => {
  it('reconnaît un nom exact', () => {
    const resolution = resolvePerfume('Aventus', catalogue)
    assert.equal(resolution.status, 'resolu')
    assert.equal(resolution.status === 'resolu' && resolution.perfume.id, 'creed-aventus')
  })

  it('absorbe une faute de frappe', () => {
    const resolution = resolvePerfume('Aventus Creed', catalogue)
    assert.equal(resolution.status, 'resolu')
  })

  it('tranche quand la saisie est le nom exact d’un parfum', () => {
    // « Sauvage » est le nom exact de Dior Sauvage : l'égalité stricte prime
    // sur la sous-chaîne trouvée dans Eau Sauvage.
    const resolution = resolvePerfume('sauvage', catalogue)
    assert.equal(resolution.status, 'resolu')
    assert.equal(resolution.status === 'resolu' && resolution.perfume.id, 'dior-sauvage-edt')
  })

  it('demande à l’utilisateur plutôt que de trancher entre deux proches', () => {
    // « intense » se retrouve dans deux parfums de marques différentes :
    // deviner fausserait silencieusement la collection.
    const resolution = resolvePerfume('intense', catalogue)
    assert.equal(resolution.status, 'ambigu')
    assert.ok(resolution.candidates.length >= 2)
    assert.equal(resolution.candidates.length >= 2 && 'perfume' in resolution.candidates[0], true)
  })

  it('ne rend rien quand rien ne correspond', () => {
    const resolution = resolvePerfume('parfum totalement inexistant xyz', catalogue)
    assert.equal(resolution.status, 'introuvable')
    assert.deepEqual(resolution.candidates, [])
  })

  it('ne propose jamais un candidat sous le seuil', () => {
    for (const candidate of matchPerfumes('zzzz', catalogue)) {
      assert.ok(candidate.score >= MATCH_FLOOR)
    }
  })

  it('découpe une saisie multi-lignes', () => {
    assert.deepEqual(splitInput('Aventus\nSauvage, Layton\n\n'), ['Aventus', 'Sauvage', 'Layton'])
  })
})

describe('garde-fous sur la prose engendrée', () => {
  const allowed = new Set(['creed-aventus'])

  it('repère un parfum de la base cité hors liste blanche', () => {
    const text = "Aventus reste proche de votre Club de Nuit Intense Man."
    assert.deepEqual(foreignMentions(text, catalogue, allowed), ['Armaf — Club de Nuit Intense Man'])
  })

  it('laisse passer un texte qui s’en tient aux parfums autorisés', () => {
    assert.deepEqual(foreignMentions('Aventus ouvre sur des notes fruitées.', catalogue, allowed), [])
  })

  it('repère un chiffre absent des constats', () => {
    assert.deepEqual(inventedNumbers('Similarité de 87 %.', 'Similarité de 82 %.'), ['87'])
    assert.deepEqual(inventedNumbers('Similarité de 82 %.', 'Similarité de 82 %.'), [])
  })

  it('normalise la virgule décimale avant comparaison', () => {
    assert.deepEqual(numbersIn('score 0,82 et 12'), ['0.82', '12'])
    assert.deepEqual(inventedNumbers('score 0,82', 'score 0.82'), [])
  })
})
