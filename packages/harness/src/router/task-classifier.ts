/**
 * TaskClassifier: deterministic task classification for routing.
 *
 * Three layers:
 * 1. Skill manifest declares tier (highest priority, confidence 1.0)
 * 2. Sandbox detection (isMultiFileEdit -> Codex sandbox)
 * 3. Heuristic complexity scoring (no LLM classifier per D-11)
 *
 * The classifier consults the capability matrix for model recommendations
 * but never calls an LLM for classification itself.
 */

import type { TaskTier, TaskClassification, ClassificationInput } from '../types'
import { loadMatrix, getRecommendedModel } from './capability-matrix'

const FRONTIER_THRESHOLD = 0.6
const LOCAL_THRESHOLD = 0.3

export function classifyTask(params: ClassificationInput): TaskClassification {
  // Layer 1: Skill manifest declares tier (D-09)
  if (params.skillManifest?.tier) {
    const tier = params.skillManifest.tier
    const taskType = params.skillManifest.id
    const matrix = loadMatrix()
    const recommended = getRecommendedModel(taskType, matrix)
    return {
      tier,
      reason: `Skill ${params.skillManifest.id} declares tier: ${tier}`,
      confidence: 1.0,
      taskType,
      recommendedModel: recommended ?? undefined,
    }
  }

  // Layer 2: Sandbox detection (D-03)
  if (params.isMultiFileEdit) {
    return {
      tier: 'sandbox',
      reason: 'Multi-file edit detected, routing to Codex sandbox',
      confidence: 0.8,
      taskType: 'refactor',
    }
  }

  // Layer 3: Deterministic heuristics (D-10, D-11)
  const score = computeComplexityScore(params)
  const category = params.taskCategory ?? inferCategory(params)
  const matrix = loadMatrix()
  const recommended = getRecommendedModel(category, matrix)

  if (score >= FRONTIER_THRESHOLD) {
    return {
      tier: 'frontier',
      reason: `Complexity score ${score.toFixed(2)} exceeds frontier threshold (${FRONTIER_THRESHOLD})`,
      confidence: 0.7,
      taskType: category,
      recommendedModel: recommended ?? undefined,
    }
  }

  if (score <= LOCAL_THRESHOLD) {
    return {
      tier: 'local',
      reason: `Complexity score ${score.toFixed(2)} below local threshold (${LOCAL_THRESHOLD})`,
      confidence: 0.6,
      taskType: category,
      recommendedModel: recommended ?? undefined,
    }
  }

  // Middle ground: default to frontier (conservative per Pitfall 4)
  return {
    tier: 'frontier',
    reason: `Complexity score ${score.toFixed(2)} in ambiguous range, defaulting to frontier (conservative)`,
    confidence: 0.5,
    taskType: category,
    recommendedModel: recommended ?? undefined,
  }
}

export function computeComplexityScore(params: ClassificationInput): number {
  let score = 0
  score += Math.min(params.messageLength / 2000, 1.0) * 0.2    // Long messages = more complex
  score += Math.min(params.toolCount / 5, 1.0) * 0.3            // More tools = more complex
  score += Math.min(params.conversationDepth / 10, 1.0) * 0.2   // Deep conversations = frontier
  score += (params.hasCodeReview ? 1.0 : 0) * 0.3               // Review = frontier (Claude)
  return score
}

function inferCategory(params: ClassificationInput): string {
  if (params.hasCodeReview) return 'review'
  if (params.isMultiFileEdit) return 'refactor'
  if (params.toolCount > 3) return 'debugging'
  if (params.messageLength > 1500) return 'ideation'
  return 'scaffolding'
}
