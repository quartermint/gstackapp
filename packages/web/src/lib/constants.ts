import type { Stage, Verdict, Severity } from '@gstackapp/shared'

export const STAGE_COLORS: Record<Stage, string> = {
  ceo: '#FF8B3E',
  eng: '#36C9FF',
  design: '#B084FF',
  qa: '#2EDB87',
  security: '#FF5A67',
}

export const STAGE_LABELS: Record<Stage, string> = {
  ceo: 'CEO Review',
  eng: 'Eng Review',
  design: 'Design Review',
  qa: 'QA',
  security: 'Security',
}

export const VERDICT_COLORS: Record<Verdict | 'RUNNING', string> = {
  PASS: '#2EDB87',
  FLAG: '#FFB020',
  BLOCK: '#FF5A67',
  SKIP: '#6F7C90',
  RUNNING: '#36C9FF',
}

export const SEVERITY_LABELS: Record<Severity, string> = {
  critical: 'Critical',
  notable: 'Notable',
  minor: 'Minor',
}
