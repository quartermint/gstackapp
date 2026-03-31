/**
 * Barrel export for the embeddings module.
 */

export { embedPipelineFindings, normalizeFindingText } from './embed'
export { findCrossRepoMatches, type CrossRepoMatch } from './search'
export { initVecTable } from './store'
