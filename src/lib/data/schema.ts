import { COMBINED_DIM } from '@/lib/domain/vector'
import { ACCORD_DIM, FACET_DIM, NOTE_DIM } from '@/lib/domain/vocabulary'

/**
 * DDL Postgres, engendré à partir des dimensions réelles du vocabulaire.
 *
 * La dimension du vecteur n'est jamais écrite à la main : elle découle du
 * nombre de notes, d'accords et de facettes. Une constante figée finirait par
 * diverger du vocabulaire, et l'erreur ne se verrait qu'au premier INSERT.
 */
export function schemaSql(): string {
  return `-- Schéma engendré par scripts/db-setup.ts — ne pas éditer à la main.
-- Dimensions : ${NOTE_DIM} notes + ${ACCORD_DIM} accords + ${FACET_DIM} facettes = ${COMBINED_DIM}.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS perfume (
  id                  text PRIMARY KEY,
  brand               text NOT NULL,
  name                text NOT NULL,
  year                integer,
  concentration       text NOT NULL DEFAULT 'inconnue',
  perfumers           text[] NOT NULL DEFAULT '{}',
  family              text,
  seasons             text[] NOT NULL DEFAULT '{}',
  moments             text[] NOT NULL DEFAULT '{}',
  intensity           text CHECK (intensity IN ('discret', 'modere', 'puissant')),
  -- Provenance : sans date de collecte, l'interface doit afficher « inconnu ».
  collected_at        date,
  verified_at         date,
  -- Empreinte du vocabulaire ayant servi à calculer l'embedding. Si elle ne
  -- correspond plus à VOCABULARY_VERSION, le vecteur est périmé.
  vocabulary_version  text,
  embedding           vector(${COMBINED_DIM}),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS perfume_note (
  perfume_id  text NOT NULL REFERENCES perfume(id) ON DELETE CASCADE,
  note_id     text NOT NULL,
  level       text NOT NULL CHECK (level IN ('tete', 'coeur', 'fond')),
  -- NULL = la source ne hiérarchise pas les notes de cet étage.
  weight      real CHECK (weight IS NULL OR (weight >= 0 AND weight <= 1)),
  PRIMARY KEY (perfume_id, note_id, level)
);

CREATE TABLE IF NOT EXISTS perfume_accord (
  perfume_id  text NOT NULL REFERENCES perfume(id) ON DELETE CASCADE,
  accord_id   text NOT NULL,
  strength    real CHECK (strength IS NULL OR (strength >= 0 AND strength <= 1)),
  PRIMARY KEY (perfume_id, accord_id)
);

CREATE TABLE IF NOT EXISTS perfume_source (
  id          bigserial PRIMARY KEY,
  perfume_id  text NOT NULL REFERENCES perfume(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('marque', 'revendeur', 'communaute', 'seed-manuel')),
  url         text,
  label       text NOT NULL
);
CREATE INDEX IF NOT EXISTS perfume_source_perfume_idx ON perfume_source (perfume_id);

CREATE TABLE IF NOT EXISTS dupe_link (
  id                   text PRIMARY KEY,
  perfume_original_id  text NOT NULL REFERENCES perfume(id) ON DELETE CASCADE,
  perfume_clone_id     text NOT NULL REFERENCES perfume(id) ON DELETE CASCADE,
  confidence           real NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  verified_at          date,
  CONSTRAINT dupe_link_distinct CHECK (perfume_original_id <> perfume_clone_id),
  CONSTRAINT dupe_link_pair UNIQUE (perfume_original_id, perfume_clone_id)
);

CREATE TABLE IF NOT EXISTS dupe_source (
  id            bigserial PRIMARY KEY,
  dupe_link_id  text NOT NULL REFERENCES dupe_link(id) ON DELETE CASCADE,
  type          text NOT NULL CHECK (type IN ('marque', 'revendeur', 'communaute', 'seed-manuel')),
  url           text,
  label         text NOT NULL
);
CREATE INDEX IF NOT EXISTS dupe_source_link_idx ON dupe_source (dupe_link_id);

CREATE TABLE IF NOT EXISTS user_collection (
  user_id      text NOT NULL,
  perfume_id   text NOT NULL REFERENCES perfume(id) ON DELETE CASCADE,
  status       text NOT NULL CHECK (status IN ('possede', 'en-commande', 'termine')),
  acquired_at  date,
  PRIMARY KEY (user_id, perfume_id)
);

CREATE TABLE IF NOT EXISTS user_wishlist (
  user_id           text NOT NULL,
  perfume_id        text NOT NULL REFERENCES perfume(id) ON DELETE CASCADE,
  intensity         text NOT NULL CHECK (intensity IN ('aime', 'adore')),
  smelled_or_owned  boolean NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, perfume_id)
);

-- Index ANN : sert à présélectionner des candidats, jamais à produire le score
-- final. Le score exact reste calculé en TypeScript, car un axe non renseigné
-- doit être ignoré et non compté comme une divergence — ce que le cosinus brut
-- du vecteur stocké ne sait pas faire.
CREATE INDEX IF NOT EXISTS perfume_embedding_idx
  ON perfume USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS perfume_brand_name_idx ON perfume (lower(brand), lower(name));
`
}
