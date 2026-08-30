import 'server-only'

import type { z } from 'zod'

/**
 * Client Kimi (Moonshot).
 *
 * Le LLM n'a que deux missions dans cette application : choisir dans une liste
 * fermée qu'on lui fournit, et reformuler un résultat déjà calculé. Il ne
 * produit jamais de donnée nouvelle, et sa sortie est systématiquement validée
 * avant d'atteindre l'interface.
 *
 * Sans clé, `isAvailable()` rend false et tout le produit continue de
 * fonctionner sur ses replis déterministes.
 */

const DEFAULT_BASE_URL = 'https://api.moonshot.ai/v1'
const DEFAULT_MODEL = 'kimi-k2-0905-preview'

export interface KimiConfig {
  apiKey: string
  baseUrl: string
  model: string
}

export function readKimiConfig(): KimiConfig | null {
  const apiKey = process.env.MOONSHOT_API_KEY?.trim()
  if (!apiKey) return null
  return {
    apiKey,
    baseUrl: process.env.MOONSHOT_BASE_URL?.trim() || DEFAULT_BASE_URL,
    model: process.env.KIMI_MODEL?.trim() || DEFAULT_MODEL,
  }
}

export function isAvailable(): boolean {
  return readKimiConfig() !== null
}

export interface ChatMessage {
  role: 'system' | 'user'
  content: string
}

export class KimiError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'KimiError'
  }
}

interface CompletionResponse {
  choices?: { message?: { content?: string } }[]
}

/**
 * Appel brut. `temperature` est à 0 : deux exécutions sur la même entrée
 * doivent donner la même sortie, sans quoi l'application cesserait d'être
 * reproductible.
 */
async function complete(
  config: KimiConfig,
  messages: ChatMessage[],
  options: { jsonMode: boolean; maxTokens: number; signal?: AbortSignal },
): Promise<string> {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: 0,
      max_tokens: options.maxTokens,
      ...(options.jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
    signal: options.signal ?? AbortSignal.timeout(20_000),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new KimiError(`Kimi a répondu ${response.status} : ${body.slice(0, 300)}`)
  }

  const payload = (await response.json()) as CompletionResponse
  const content = payload.choices?.[0]?.message?.content
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new KimiError('Réponse Kimi vide')
  }
  return content
}

/** Appel attendant du JSON, validé par un schéma. Toute dérive lève. */
export async function completeJson<T>(
  config: KimiConfig,
  messages: ChatMessage[],
  schema: z.ZodType<T>,
  options: { maxTokens?: number; signal?: AbortSignal } = {},
): Promise<T> {
  const raw = await complete(config, messages, {
    jsonMode: true,
    maxTokens: options.maxTokens ?? 512,
    signal: options.signal,
  })

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new KimiError(`JSON illisible : ${raw.slice(0, 200)}`, error)
  }

  const result = schema.safeParse(parsed)
  if (!result.success) {
    throw new KimiError(`JSON hors schéma : ${result.error.issues.map((i) => i.message).join(', ')}`)
  }
  return result.data
}

export async function completeText(
  config: KimiConfig,
  messages: ChatMessage[],
  options: { maxTokens?: number; signal?: AbortSignal } = {},
): Promise<string> {
  return (
    await complete(config, messages, {
      jsonMode: false,
      maxTokens: options.maxTokens ?? 400,
      signal: options.signal,
    })
  ).trim()
}
