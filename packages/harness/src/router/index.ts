/**
 * Router module barrel export.
 */

export { ProviderDegradedError, AllProvidersDegradedError } from './errors'
export { type FallbackPolicy, type RouterConfig, loadRouterConfig } from './config'
export { isProviderCapError, extractRetryAfterMs } from './reactive'
export { BurnRateCalculator } from './predictive'
export { ProactivePoller } from './proactive'
export { RequestQueue } from './queue'
export { ModelRouter } from './model-router'
export type { ModelRouterOptions } from './model-router'
