import { AGENT_PROFILES, TRUST_LEVELS } from '../constants.js';
import type { TrustLevel } from './trust.js';

/**
 * Agent profile identifier
 */
export type AgentProfileId =
  (typeof AGENT_PROFILES)[keyof typeof AGENT_PROFILES];

/**
 * Tools available to agents
 */
export type AllowedTool =
  | 'read_file'
  | 'write_file'
  | 'execute_command'
  | 'web_search'
  | 'web_fetch'
  | 'list_directory'
  | 'git_operations'
  | 'npm_operations'
  | 'task_dispatch';

/**
 * Agent profile definition
 */
export interface AgentProfile {
  /** Unique profile identifier */
  id: AgentProfileId;
  /** Human-readable name */
  name: string;
  /** Description of agent capabilities */
  description: string;
  /** Minimum trust level required to use this profile */
  minTrustLevel: TrustLevel;
  /** Tools this agent can use */
  allowedTools: readonly AllowedTool[];
  /** System prompt additions for this profile */
  systemPromptAdditions?: string;
  /** Maximum tokens for responses */
  maxTokens?: number;
}

/**
 * Predefined agent profiles
 */
export const AGENT_PROFILE_DEFINITIONS: Record<AgentProfileId, AgentProfile> = {
  [AGENT_PROFILES.CHAT_READONLY]: {
    id: AGENT_PROFILES.CHAT_READONLY,
    name: 'Chat (Read-Only)',
    description: 'Conversational agent with no tool access',
    minTrustLevel: TRUST_LEVELS.UNTRUSTED,
    allowedTools: [],
    maxTokens: 4096,
  },
  [AGENT_PROFILES.CODE_ASSISTANT]: {
    id: AGENT_PROFILES.CODE_ASSISTANT,
    name: 'Code Assistant',
    description: 'Code helper with read-only file access',
    minTrustLevel: TRUST_LEVELS.AUTHENTICATED,
    allowedTools: ['read_file', 'list_directory', 'web_search', 'web_fetch'],
    maxTokens: 8192,
  },
  [AGENT_PROFILES.TASK_ORCHESTRATOR]: {
    id: AGENT_PROFILES.TASK_ORCHESTRATOR,
    name: 'Task Orchestrator',
    description: 'Full-capability agent for internal use',
    minTrustLevel: TRUST_LEVELS.INTERNAL,
    allowedTools: [
      'read_file',
      'write_file',
      'execute_command',
      'web_search',
      'web_fetch',
      'list_directory',
      'git_operations',
      'npm_operations',
      'task_dispatch',
    ],
    maxTokens: 16384,
  },
};

/**
 * Type guard for agent profile ID
 */
export function isAgentProfileId(value: unknown): value is AgentProfileId {
  return (
    typeof value === 'string' &&
    Object.values(AGENT_PROFILES).includes(value as AgentProfileId)
  );
}
