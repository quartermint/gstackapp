/**
 * Role resolver for email-based access control.
 *
 * Maps emails to roles (admin/operator) via environment variable allowlists.
 * Per D-03: ADMIN_EMAILS and OPERATOR_EMAILS are comma-separated.
 */

function parseEmailList(envVar: string | undefined): string[] {
  if (!envVar) return []
  return envVar
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * Resolve the role for a given email address.
 *
 * Checks ADMIN_EMAILS first, then OPERATOR_EMAILS.
 * Case-insensitive comparison. Returns null if not in any allowlist.
 */
export function resolveRole(email: string): 'admin' | 'operator' | null {
  const normalized = email.toLowerCase().trim()

  const adminEmails = parseEmailList(process.env.ADMIN_EMAILS)
  if (adminEmails.includes(normalized)) return 'admin'

  const operatorEmails = parseEmailList(process.env.OPERATOR_EMAILS)
  if (operatorEmails.includes(normalized)) return 'operator'

  return null
}

/**
 * Check if an email is in any allowlist (admin or operator).
 */
export function isKnownUser(email: string): boolean {
  return resolveRole(email) !== null
}
