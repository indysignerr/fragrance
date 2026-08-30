import type { CollectionEntry, Perfume, PerfumeAccord, PerfumeNote, WishlistEntry } from '@/lib/domain/types'

export function perfume(id: string, overrides: Partial<Perfume> = {}): Perfume {
  return {
    id,
    brand: 'Maison Test',
    name: id,
    year: null,
    concentration: 'eau-de-parfum',
    perfumers: [],
    notes: [],
    accords: [],
    family: null,
    seasons: [],
    moments: [],
    intensity: null,
    provenance: { sources: [], collectedAt: null, verifiedAt: null },
    ...overrides,
  }
}

export const note = (noteId: string, level: PerfumeNote['level'], weight: number | null = null): PerfumeNote => ({ noteId, level, weight })
export const accord = (accordId: string, strength: number | null = null): PerfumeAccord => ({ accordId, strength })
export const owns = (perfumeId: string, status: CollectionEntry['status'] = 'possede'): CollectionEntry => ({ userId: 'u', perfumeId, status, acquiredAt: null })
export const wishes = (perfumeId: string, intensity: WishlistEntry['intensity'] = 'adore', smelledOrOwned = true): WishlistEntry => ({ userId: 'u', perfumeId, intensity, smelledOrOwned })
