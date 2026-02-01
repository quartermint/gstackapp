/**
 * Input sanitization service
 *
 * Detects and blocks various injection patterns to prevent
 * the "Lethal Trifecta" (untrusted input + AI agent + shell access)
 */

import { LIMITS } from '@mission-control/shared';

/**
 * Injection pattern definitions with descriptions
 */
const INJECTION_PATTERNS: Array<{
  name: string;
  pattern: RegExp;
  description: string;
}> = [
  // SQL Injection patterns
  {
    name: 'SQL_UNION',
    pattern: /\bUNION\s+(ALL\s+)?SELECT\b/i,
    description: 'SQL UNION injection attempt',
  },
  {
    name: 'SQL_DROP',
    pattern: /\bDROP\s+(TABLE|DATABASE|INDEX)\b/i,
    description: 'SQL DROP statement detected',
  },
  {
    name: 'SQL_DELETE_ALL',
    pattern: /\bDELETE\s+FROM\s+\w+\s*(WHERE\s+1\s*=\s*1|;)/i,
    description: 'SQL mass DELETE detected',
  },
  {
    name: 'SQL_COMMENT',
    pattern: /('|")\s*(--|#|\/\*)/,
    description: 'SQL comment injection',
  },
  {
    name: 'SQL_OR_TRUE',
    pattern: /'\s*OR\s*'?\d*'?\s*=\s*'?\d*'?/i,
    description: 'SQL OR injection (tautology)',
  },

  // Command injection patterns
  {
    name: 'CMD_SEMICOLON',
    pattern: /;\s*(rm|chmod|chown|sudo|curl|wget|nc|bash|sh|zsh|python|perl|ruby|node)\b/i,
    description: 'Command chaining with dangerous command',
  },
  {
    name: 'CMD_PIPE',
    pattern: /\|\s*(bash|sh|zsh|python|perl|ruby|node)\b/i,
    description: 'Pipe to shell interpreter',
  },
  {
    name: 'CMD_BACKTICK',
    pattern: /`[^`]*`/,
    description: 'Command substitution via backticks',
  },
  {
    name: 'CMD_SUBSHELL',
    pattern: /\$\([^)]+\)/,
    description: 'Command substitution via $()',
  },
  {
    name: 'CMD_REDIRECT_WRITE',
    pattern: />\s*\/etc\/|>\s*~\/\./,
    description: 'Redirect to sensitive location',
  },

  // Path traversal patterns
  {
    name: 'PATH_TRAVERSAL',
    pattern: /\.\.[\/\\]/,
    description: 'Path traversal attempt',
  },
  {
    name: 'PATH_ABSOLUTE_SENSITIVE',
    pattern: /\/etc\/(passwd|shadow|sudoers)|\/root\//,
    description: 'Access to sensitive system paths',
  },

  // XSS patterns
  {
    name: 'XSS_SCRIPT',
    pattern: /<script\b[^>]*>/i,
    description: 'Script tag injection',
  },
  {
    name: 'XSS_EVENT',
    pattern: /\bon\w+\s*=/i,
    description: 'Event handler injection',
  },
  {
    name: 'XSS_JAVASCRIPT_URI',
    pattern: /javascript\s*:/i,
    description: 'JavaScript URI scheme',
  },

  // Template injection patterns
  {
    name: 'TEMPLATE_JINJA',
    pattern: /\{\{.*\}\}/,
    description: 'Template injection (Jinja/Mustache style)',
  },
  {
    name: 'TEMPLATE_ERB',
    pattern: /<%.*%>/,
    description: 'Template injection (ERB style)',
  },

  // LDAP injection - only flag when combined with LDAP-specific syntax
  {
    name: 'LDAP_INJECTION',
    pattern: /\([&|!][^)]*\)|\)\([&|]/,
    description: 'LDAP filter injection pattern',
  },

  // NoSQL injection
  {
    name: 'NOSQL_OPERATOR',
    pattern: /\$\b(where|ne|gt|lt|gte|lte|in|nin|regex|exists)\b/i,
    description: 'NoSQL operator injection',
  },

  // Prompt injection (AI-specific)
  {
    name: 'PROMPT_IGNORE',
    pattern: /ignore\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?)/i,
    description: 'Prompt injection - ignore instructions',
  },
  {
    name: 'PROMPT_SYSTEM',
    pattern: /\bsystem\s*:\s*you\s+are\b/i,
    description: 'Prompt injection - system prompt override',
  },
  {
    name: 'PROMPT_JAILBREAK',
    pattern: /\b(DAN|jailbreak|bypass|override)\s+(mode|filter|restriction)/i,
    description: 'Prompt injection - jailbreak attempt',
  },
];

/**
 * Result of input sanitization
 */
export interface SanitizeResult {
  /** Whether the input is considered safe */
  safe: boolean;
  /** List of detected issues */
  issues: string[];
  /** Original input length */
  inputLength: number;
  /** Detected pattern names */
  detectedPatterns: string[];
}

/**
 * Sanitize input by checking for injection patterns and length limits
 *
 * @param input - The input string to sanitize
 * @returns SanitizeResult with safety status and any detected issues
 */
export function sanitize(input: string): SanitizeResult {
  const issues: string[] = [];
  const detectedPatterns: string[] = [];

  // Check length limit
  if (input.length > LIMITS.MAX_INPUT_LENGTH) {
    issues.push(
      `Input exceeds maximum length (${input.length} > ${LIMITS.MAX_INPUT_LENGTH})`
    );
  }

  // Check for null bytes (common in injection attacks)
  if (input.includes('\0')) {
    issues.push('Input contains null bytes');
    detectedPatterns.push('NULL_BYTE');
  }

  // Check each injection pattern
  for (const { name, pattern, description } of INJECTION_PATTERNS) {
    if (pattern.test(input)) {
      issues.push(description);
      detectedPatterns.push(name);
    }
  }

  return {
    safe: issues.length === 0,
    issues,
    inputLength: input.length,
    detectedPatterns,
  };
}

/**
 * Strip potentially dangerous characters from input
 * Use when you need to allow some input through with reduced risk
 *
 * @param input - The input to strip
 * @returns Stripped input string
 */
export function stripDangerousChars(input: string): string {
  return input
    .replace(/\0/g, '') // Null bytes
    .replace(/[<>]/g, '') // HTML brackets
    .replace(/[`$]/g, '') // Command substitution
    .replace(/\.\.\//g, '') // Path traversal
    .trim();
}

/**
 * Check if input contains only alphanumeric and safe punctuation
 *
 * @param input - The input to check
 * @returns Whether input is strictly safe
 */
export function isStrictlySafe(input: string): boolean {
  // Allow alphanumeric, spaces, and basic punctuation
  const safePattern = /^[a-zA-Z0-9\s.,!?'-]+$/;
  return safePattern.test(input);
}
