/**
 * Vocabulaire contrôlé.
 *
 * C'est le référentiel fermé du moteur : une note ou un accord qui n'est pas
 * listé ici n'existe pas. Toute entrée utilisateur en texte libre — et toute
 * sortie du LLM — est résolue contre ces tables. Rien n'est créé à la volée.
 *
 * Les `facets` regroupent les notes en familles olfactives. Elles servent de
 * second niveau de comparaison : deux parfums peuvent ne partager aucune note
 * littérale et sentir pourtant la même chose (un cèdre et un vétiver sont deux
 * boisés secs). Comparer uniquement les notes raterait cette proximité.
 */

export interface Facet {
  id: string
  label: string
}

export interface NoteDef {
  id: string
  label: string
  facet: string
  /** Formes alternatives, pour la résolution de texte libre. */
  synonyms: string[]
}

export interface AccordDef {
  id: string
  label: string
}

export const FACETS = [
  { id: 'agrumes', label: 'Agrumes' },
  { id: 'aromatique', label: 'Aromatique' },
  { id: 'verte', label: 'Verte' },
  { id: 'herbacee', label: 'Herbacée' },
  { id: 'florale-blanche', label: 'Florale blanche' },
  { id: 'florale-rosee', label: 'Florale rosée' },
  { id: 'florale-poudree', label: 'Florale poudrée' },
  { id: 'fruitee', label: 'Fruitée' },
  { id: 'gourmande', label: 'Gourmande' },
  { id: 'epicee-chaude', label: 'Épicée chaude' },
  { id: 'epicee-fraiche', label: 'Épicée fraîche' },
  { id: 'boisee-seche', label: 'Boisée sèche' },
  { id: 'boisee-cremeuse', label: 'Boisée crémeuse' },
  { id: 'ambree', label: 'Ambrée' },
  { id: 'resineuse', label: 'Résineuse' },
  { id: 'balsamique', label: 'Balsamique' },
  { id: 'cuir', label: 'Cuir' },
  { id: 'animale', label: 'Animale' },
  { id: 'musquee', label: 'Musquée' },
  { id: 'marine', label: 'Marine' },
  { id: 'minerale', label: 'Minérale' },
  { id: 'aldehydee', label: 'Aldéhydée' },
  { id: 'fumee', label: 'Fumée' },
  { id: 'terreuse', label: 'Terreuse' },
] satisfies readonly Facet[]

export const NOTES: readonly NoteDef[] = [
  // — Agrumes
  { id: 'bergamote', label: 'Bergamote', facet: 'agrumes', synonyms: ['bergamot'] },
  { id: 'citron', label: 'Citron', facet: 'agrumes', synonyms: ['lemon'] },
  { id: 'orange', label: 'Orange', facet: 'agrumes', synonyms: ['orange douce'] },
  { id: 'mandarine', label: 'Mandarine', facet: 'agrumes', synonyms: ['tangerine'] },
  { id: 'pamplemousse', label: 'Pamplemousse', facet: 'agrumes', synonyms: ['grapefruit'] },
  { id: 'yuzu', label: 'Yuzu', facet: 'agrumes', synonyms: [] },
  { id: 'lime', label: 'Citron vert', facet: 'agrumes', synonyms: ['lime', 'limette'] },
  { id: 'cedrat', label: 'Cédrat', facet: 'agrumes', synonyms: ['citron cédrat'] },
  { id: 'bigarade', label: 'Bigarade', facet: 'agrumes', synonyms: ['orange amère'] },
  { id: 'petitgrain', label: 'Petitgrain', facet: 'agrumes', synonyms: [] },

  // — Aromatique
  { id: 'lavande', label: 'Lavande', facet: 'aromatique', synonyms: ['lavender'] },
  { id: 'romarin', label: 'Romarin', facet: 'aromatique', synonyms: ['rosemary'] },
  { id: 'sauge', label: 'Sauge', facet: 'aromatique', synonyms: ['sage'] },
  { id: 'sauge-sclaree', label: 'Sauge sclarée', facet: 'aromatique', synonyms: ['clary sage'] },
  { id: 'thym', label: 'Thym', facet: 'aromatique', synonyms: ['thyme'] },
  { id: 'basilic', label: 'Basilic', facet: 'aromatique', synonyms: ['basil'] },
  { id: 'menthe', label: 'Menthe', facet: 'aromatique', synonyms: ['mint', 'menthe poivrée'] },
  { id: 'eucalyptus', label: 'Eucalyptus', facet: 'aromatique', synonyms: [] },
  { id: 'armoise', label: 'Armoise', facet: 'aromatique', synonyms: ['wormwood', 'artemisia'] },
  { id: 'anis', label: 'Anis', facet: 'aromatique', synonyms: ['anise', 'badiane'] },
  { id: 'estragon', label: 'Estragon', facet: 'aromatique', synonyms: ['tarragon'] },
  { id: 'absinthe', label: 'Absinthe', facet: 'aromatique', synonyms: [] },

  // — Verte
  { id: 'galbanum', label: 'Galbanum', facet: 'verte', synonyms: [] },
  { id: 'feuille-de-violette', label: 'Feuille de violette', facet: 'verte', synonyms: ['violet leaf'] },
  { id: 'feuille-de-figuier', label: 'Feuille de figuier', facet: 'verte', synonyms: ['fig leaf'] },
  { id: 'gazon', label: 'Herbe coupée', facet: 'verte', synonyms: ['gazon', 'cut grass'] },
  { id: 'bambou', label: 'Bambou', facet: 'verte', synonyms: ['bamboo'] },
  { id: 'lierre', label: 'Lierre', facet: 'verte', synonyms: ['ivy'] },
  { id: 'feuille-de-tomate', label: 'Feuille de tomate', facet: 'verte', synonyms: ['tomato leaf'] },
  { id: 'rhubarbe', label: 'Rhubarbe', facet: 'verte', synonyms: ['rhubarb'] },

  // — Herbacée
  { id: 'foin', label: 'Foin', facet: 'herbacee', synonyms: ['hay'] },
  { id: 'the-vert', label: 'Thé vert', facet: 'herbacee', synonyms: ['green tea', 'the'] },
  { id: 'the-noir', label: 'Thé noir', facet: 'herbacee', synonyms: ['black tea'] },
  { id: 'mate', label: 'Maté', facet: 'herbacee', synonyms: [] },
  { id: 'immortelle', label: 'Immortelle', facet: 'herbacee', synonyms: ['helichrysum'] },

  // — Florale blanche
  { id: 'jasmin', label: 'Jasmin', facet: 'florale-blanche', synonyms: ['jasmine', 'sambac'] },
  { id: 'tubereuse', label: 'Tubéreuse', facet: 'florale-blanche', synonyms: ['tuberose'] },
  { id: 'fleur-doranger', label: "Fleur d'oranger", facet: 'florale-blanche', synonyms: ['orange blossom'] },
  { id: 'neroli', label: 'Néroli', facet: 'florale-blanche', synonyms: [] },
  { id: 'gardenia', label: 'Gardénia', facet: 'florale-blanche', synonyms: [] },
  { id: 'ylang-ylang', label: 'Ylang-ylang', facet: 'florale-blanche', synonyms: ['ylang'] },
  { id: 'magnolia', label: 'Magnolia', facet: 'florale-blanche', synonyms: [] },
  { id: 'chevrefeuille', label: 'Chèvrefeuille', facet: 'florale-blanche', synonyms: ['honeysuckle'] },
  { id: 'muguet', label: 'Muguet', facet: 'florale-blanche', synonyms: ['lily of the valley'] },
  { id: 'freesia', label: 'Freesia', facet: 'florale-blanche', synonyms: [] },
  { id: 'narcisse', label: 'Narcisse', facet: 'florale-blanche', synonyms: ['narcissus'] },
  { id: 'lys', label: 'Lys', facet: 'florale-blanche', synonyms: ['lily'] },

  // — Florale rosée
  { id: 'rose', label: 'Rose', facet: 'florale-rosee', synonyms: [] },
  { id: 'rose-de-damas', label: 'Rose de Damas', facet: 'florale-rosee', synonyms: ['damascena'] },
  { id: 'rose-centifolia', label: 'Rose centifolia', facet: 'florale-rosee', synonyms: ['rose de mai'] },
  { id: 'pivoine', label: 'Pivoine', facet: 'florale-rosee', synonyms: ['peony'] },
  { id: 'geranium', label: 'Géranium', facet: 'florale-rosee', synonyms: [] },

  // — Florale poudrée
  { id: 'iris', label: 'Iris', facet: 'florale-poudree', synonyms: ['orris', 'racine iris'] },
  { id: 'violette', label: 'Violette', facet: 'florale-poudree', synonyms: ['violet'] },
  { id: 'mimosa', label: 'Mimosa', facet: 'florale-poudree', synonyms: [] },
  { id: 'heliotrope', label: 'Héliotrope', facet: 'florale-poudree', synonyms: [] },
  { id: 'oeillet', label: 'Œillet', facet: 'florale-poudree', synonyms: ['oeillet', 'carnation'] },

  // — Fruitée
  { id: 'pomme', label: 'Pomme', facet: 'fruitee', synonyms: ['apple'] },
  { id: 'poire', label: 'Poire', facet: 'fruitee', synonyms: ['pear'] },
  { id: 'peche', label: 'Pêche', facet: 'fruitee', synonyms: ['peach'] },
  { id: 'abricot', label: 'Abricot', facet: 'fruitee', synonyms: ['apricot'] },
  { id: 'prune', label: 'Prune', facet: 'fruitee', synonyms: ['plum'] },
  { id: 'cassis', label: 'Cassis', facet: 'fruitee', synonyms: ['blackcurrant'] },
  { id: 'framboise', label: 'Framboise', facet: 'fruitee', synonyms: ['raspberry'] },
  { id: 'fraise', label: 'Fraise', facet: 'fruitee', synonyms: ['strawberry'] },
  { id: 'mure', label: 'Mûre', facet: 'fruitee', synonyms: ['blackberry'] },
  { id: 'cerise', label: 'Cerise', facet: 'fruitee', synonyms: ['cherry'] },
  { id: 'ananas', label: 'Ananas', facet: 'fruitee', synonyms: ['pineapple'] },
  { id: 'mangue', label: 'Mangue', facet: 'fruitee', synonyms: ['mango'] },
  { id: 'fruit-de-la-passion', label: 'Fruit de la passion', facet: 'fruitee', synonyms: ['passion fruit'] },
  { id: 'melon', label: 'Melon', facet: 'fruitee', synonyms: [] },
  { id: 'figue', label: 'Figue', facet: 'fruitee', synonyms: ['fig'] },
  { id: 'litchi', label: 'Litchi', facet: 'fruitee', synonyms: ['lychee'] },

  // — Gourmande
  { id: 'vanille', label: 'Vanille', facet: 'gourmande', synonyms: ['vanilla', 'bourbon'] },
  { id: 'caramel', label: 'Caramel', facet: 'gourmande', synonyms: [] },
  { id: 'praline', label: 'Praline', facet: 'gourmande', synonyms: [] },
  { id: 'chocolat', label: 'Chocolat', facet: 'gourmande', synonyms: ['cacao', 'chocolate'] },
  { id: 'cafe', label: 'Café', facet: 'gourmande', synonyms: ['coffee'] },
  { id: 'miel', label: 'Miel', facet: 'gourmande', synonyms: ['honey'] },
  { id: 'amande', label: 'Amande', facet: 'gourmande', synonyms: ['almond'] },
  { id: 'noisette', label: 'Noisette', facet: 'gourmande', synonyms: ['hazelnut'] },
  { id: 'coco', label: 'Noix de coco', facet: 'gourmande', synonyms: ['coconut'] },
  { id: 'lait', label: 'Lait', facet: 'gourmande', synonyms: ['milk', 'lactone'] },
  { id: 'rhum', label: 'Rhum', facet: 'gourmande', synonyms: ['rum'] },
  { id: 'pain-depice', label: "Pain d'épice", facet: 'gourmande', synonyms: ['gingerbread'] },
  { id: 'feve-tonka', label: 'Fève tonka', facet: 'gourmande', synonyms: ['tonka', 'coumarine'] },

  // — Épicée chaude
  { id: 'cannelle', label: 'Cannelle', facet: 'epicee-chaude', synonyms: ['cinnamon'] },
  { id: 'clou-de-girofle', label: 'Clou de girofle', facet: 'epicee-chaude', synonyms: ['girofle', 'clove'] },
  { id: 'muscade', label: 'Muscade', facet: 'epicee-chaude', synonyms: ['nutmeg'] },
  { id: 'safran', label: 'Safran', facet: 'epicee-chaude', synonyms: ['saffron'] },
  { id: 'piment', label: 'Piment', facet: 'epicee-chaude', synonyms: ['chili'] },
  { id: 'gingembre', label: 'Gingembre', facet: 'epicee-chaude', synonyms: ['ginger'] },
  { id: 'cumin', label: 'Cumin', facet: 'epicee-chaude', synonyms: [] },

  // — Épicée fraîche
  { id: 'poivre-noir', label: 'Poivre noir', facet: 'epicee-fraiche', synonyms: ['black pepper', 'poivre'] },
  { id: 'poivre-rose', label: 'Poivre rose', facet: 'epicee-fraiche', synonyms: ['pink pepper', 'baies roses'] },
  { id: 'cardamome', label: 'Cardamome', facet: 'epicee-fraiche', synonyms: ['cardamom'] },
  { id: 'coriandre', label: 'Coriandre', facet: 'epicee-fraiche', synonyms: ['coriander'] },
  { id: 'genievre', label: 'Baies de genièvre', facet: 'epicee-fraiche', synonyms: ['juniper'] },

  // — Boisée sèche
  { id: 'cedre', label: 'Cèdre', facet: 'boisee-seche', synonyms: ['cedar', 'cedarwood'] },
  { id: 'vetiver', label: 'Vétiver', facet: 'boisee-seche', synonyms: ['vetivert'] },
  { id: 'cypres', label: 'Cyprès', facet: 'boisee-seche', synonyms: ['cypress'] },
  { id: 'pin', label: 'Pin', facet: 'boisee-seche', synonyms: ['pine', 'sapin'] },
  { id: 'gaiac', label: 'Bois de gaïac', facet: 'boisee-seche', synonyms: ['guaiac'] },
  { id: 'papyrus', label: 'Papyrus', facet: 'boisee-seche', synonyms: [] },
  { id: 'bouleau', label: 'Bouleau', facet: 'boisee-seche', synonyms: ['birch'] },

  // — Boisée crémeuse
  { id: 'santal', label: 'Santal', facet: 'boisee-cremeuse', synonyms: ['sandalwood', 'bois de santal'] },
  { id: 'oud', label: 'Oud', facet: 'boisee-cremeuse', synonyms: ['agarwood', 'bois de oud'] },
  { id: 'cashmeran', label: 'Cashmeran', facet: 'boisee-cremeuse', synonyms: ['bois de cachemire'] },
  { id: 'bois-flotte', label: 'Bois flotté', facet: 'boisee-cremeuse', synonyms: ['driftwood'] },
  { id: 'sequoia', label: 'Séquoia', facet: 'boisee-cremeuse', synonyms: [] },

  // — Ambrée
  { id: 'ambre', label: 'Ambre', facet: 'ambree', synonyms: ['amber'] },
  { id: 'ambroxan', label: 'Ambroxan', facet: 'ambree', synonyms: ['ambrox', 'ambermax'] },
  { id: 'ambre-gris', label: 'Ambre gris', facet: 'ambree', synonyms: ['ambergris'] },
  { id: 'labdanum', label: 'Labdanum', facet: 'ambree', synonyms: ['ciste labdanum'] },

  // — Résineuse
  { id: 'encens', label: 'Encens', facet: 'resineuse', synonyms: ['incense', 'oliban', 'frankincense'] },
  { id: 'myrrhe', label: 'Myrrhe', facet: 'resineuse', synonyms: ['myrrh'] },
  { id: 'elemi', label: 'Élémi', facet: 'resineuse', synonyms: [] },
  { id: 'styrax', label: 'Styrax', facet: 'resineuse', synonyms: [] },
  { id: 'opoponax', label: 'Opoponax', facet: 'resineuse', synonyms: [] },

  // — Balsamique
  { id: 'benjoin', label: 'Benjoin', facet: 'balsamique', synonyms: ['benzoin'] },
  { id: 'baume-du-perou', label: 'Baume du Pérou', facet: 'balsamique', synonyms: [] },
  { id: 'baume-de-tolu', label: 'Baume de Tolu', facet: 'balsamique', synonyms: [] },
  { id: 'ciste', label: 'Ciste', facet: 'balsamique', synonyms: ['cistus'] },

  // — Cuir
  { id: 'cuir', label: 'Cuir', facet: 'cuir', synonyms: ['leather'] },
  { id: 'daim', label: 'Daim', facet: 'cuir', synonyms: ['suede'] },
  { id: 'cuir-de-russie', label: 'Cuir de Russie', facet: 'cuir', synonyms: ['russian leather'] },

  // — Animale
  { id: 'castoreum', label: 'Castoréum', facet: 'animale', synonyms: [] },
  { id: 'civette', label: 'Civette', facet: 'animale', synonyms: ['civet'] },
  { id: 'hyraceum', label: 'Hyraceum', facet: 'animale', synonyms: ['africa stone'] },
  { id: 'costus', label: 'Costus', facet: 'animale', synonyms: [] },

  // — Musquée
  { id: 'musc-blanc', label: 'Musc blanc', facet: 'musquee', synonyms: ['white musk', 'musc'] },
  { id: 'musc-poudre', label: 'Musc poudré', facet: 'musquee', synonyms: ['powdery musk'] },
  { id: 'ambrette', label: 'Ambrette', facet: 'musquee', synonyms: ['graine ambrette'] },

  // — Marine
  { id: 'notes-marines', label: 'Notes marines', facet: 'marine', synonyms: ['marine', 'aquatique', 'calone'] },
  { id: 'algue', label: 'Algue', facet: 'marine', synonyms: ['seaweed'] },
  { id: 'sel', label: 'Sel', facet: 'marine', synonyms: ['salt', 'embruns'] },

  // — Minérale
  { id: 'pierre-mouillee', label: 'Pierre mouillée', facet: 'minerale', synonyms: ['wet stone'] },
  { id: 'silex', label: 'Silex', facet: 'minerale', synonyms: ['flint'] },
  { id: 'petrichor', label: 'Petrichor', facet: 'minerale', synonyms: ['pluie'] },

  // — Aldéhydée
  { id: 'aldehydes', label: 'Aldéhydes', facet: 'aldehydee', synonyms: ['aldehyde'] },

  // — Fumée
  { id: 'fumee', label: 'Fumée', facet: 'fumee', synonyms: ['smoke', 'smoky'] },
  { id: 'goudron-de-bouleau', label: 'Goudron de bouleau', facet: 'fumee', synonyms: ['birch tar'] },
  { id: 'tabac', label: 'Tabac', facet: 'fumee', synonyms: ['tobacco'] },
  { id: 'cade', label: 'Cade', facet: 'fumee', synonyms: [] },

  // — Terreuse
  { id: 'patchouli', label: 'Patchouli', facet: 'terreuse', synonyms: ['patchouly'] },
  { id: 'mousse-de-chene', label: 'Mousse de chêne', facet: 'terreuse', synonyms: ['oakmoss', 'chypre'] },
  { id: 'terre-humide', label: 'Terre humide', facet: 'terreuse', synonyms: ['humus'] },
  { id: 'champignon', label: 'Champignon', facet: 'terreuse', synonyms: ['mushroom'] },
]

export const ACCORDS: readonly AccordDef[] = [
  { id: 'frais', label: 'Frais' },
  { id: 'agrumes', label: 'Agrumes' },
  { id: 'aromatique', label: 'Aromatique' },
  { id: 'vert', label: 'Vert' },
  { id: 'floral', label: 'Floral' },
  { id: 'fruite', label: 'Fruité' },
  { id: 'gourmand', label: 'Gourmand' },
  { id: 'sucre', label: 'Sucré' },
  { id: 'vanille', label: 'Vanillé' },
  { id: 'miel', label: 'Miellé' },
  { id: 'epice', label: 'Épicé' },
  { id: 'boise', label: 'Boisé' },
  { id: 'ambre', label: 'Ambré' },
  { id: 'resineux', label: 'Résineux' },
  { id: 'balsamique', label: 'Balsamique' },
  { id: 'cuir', label: 'Cuir' },
  { id: 'animal', label: 'Animal' },
  { id: 'musc', label: 'Musqué' },
  { id: 'poudre', label: 'Poudré' },
  { id: 'fume', label: 'Fumé' },
  { id: 'terreux', label: 'Terreux' },
  { id: 'aquatique', label: 'Aquatique' },
  { id: 'ozonique', label: 'Ozonique' },
  { id: 'mineral', label: 'Minéral' },
  { id: 'savonneux', label: 'Savonneux' },
  { id: 'metallique', label: 'Métallique' },
]

// — Index. L'ordre des tableaux ci-dessus fixe l'ordre des dimensions des
//   vecteurs ; il ne doit pas changer sans régénérer les vecteurs stockés.

export const NOTE_IDS: readonly string[] = NOTES.map((n) => n.id)
export const ACCORD_IDS: readonly string[] = ACCORDS.map((a) => a.id)
export const FACET_IDS: readonly string[] = FACETS.map((f) => f.id)

export const NOTE_INDEX = new Map(NOTE_IDS.map((id, i) => [id, i]))
export const ACCORD_INDEX = new Map(ACCORD_IDS.map((id, i) => [id, i]))
export const FACET_INDEX = new Map(FACET_IDS.map((id, i) => [id, i]))

export const NOTE_BY_ID = new Map(NOTES.map((n) => [n.id, n]))
export const ACCORD_BY_ID = new Map(ACCORDS.map((a) => [a.id, a]))
export const FACET_BY_ID = new Map(FACETS.map((f) => [f.id, f]))

export const NOTE_DIM = NOTES.length
export const ACCORD_DIM = ACCORDS.length
export const FACET_DIM = FACETS.length

/** Normalise une chaîne pour la comparaison : minuscules, sans accents ni ponctuation. */
export function normalizeTerm(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const NOTE_LOOKUP = new Map<string, string>()
for (const note of NOTES) {
  for (const term of [note.id, note.label, ...note.synonyms]) {
    NOTE_LOOKUP.set(normalizeTerm(term), note.id)
  }
}

const ACCORD_LOOKUP = new Map<string, string>()
for (const accord of ACCORDS) {
  for (const term of [accord.id, accord.label]) {
    ACCORD_LOOKUP.set(normalizeTerm(term), accord.id)
  }
}

/** Résout un terme libre vers un id de note. `null` si hors vocabulaire — on ne devine pas. */
export function resolveNoteId(term: string): string | null {
  return NOTE_LOOKUP.get(normalizeTerm(term)) ?? null
}

/** Résout un terme libre vers un id d'accord. `null` si hors vocabulaire. */
export function resolveAccordId(term: string): string | null {
  return ACCORD_LOOKUP.get(normalizeTerm(term)) ?? null
}

export function noteLabel(id: string): string {
  return NOTE_BY_ID.get(id)?.label ?? id
}

export function accordLabel(id: string): string {
  return ACCORD_BY_ID.get(id)?.label ?? id
}

export function facetLabel(id: string): string {
  return FACET_BY_ID.get(id)?.label ?? id
}

export function facetOfNote(id: string): string | null {
  return NOTE_BY_ID.get(id)?.facet ?? null
}
