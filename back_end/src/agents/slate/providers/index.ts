import type { HealthResponse, ProviderId } from '../../../shared/protocol'
import { env } from '../env'
import { basetenProvider } from './baseten'
import { metaProvider } from './meta'
import type { Provider } from './types'

export function isConfigured(id: ProviderId): boolean {
  return id === 'meta' ? !!env.metaKey : !!env.basetenKey
}

export function health(): HealthResponse {
  return {
    providers: {
      baseten: { configured: isConfigured('baseten'), model: env.basetenModel, label: 'Baseten · Muse Spark Open (open weights)' },
      meta: { configured: isConfigured('meta'), model: env.metaModel, label: 'Meta Model API · Muse Spark' },
    },
  }
}

/** Requested provider first, then the other one (if it has a key) as automatic fallback. */
export function providerChain(requested: ProviderId): Provider[] {
  const order: ProviderId[] = requested === 'meta' ? ['meta', 'baseten'] : ['baseten', 'meta']
  return order.filter(isConfigured).map((id) => (id === 'meta' ? metaProvider() : basetenProvider()))
}
