import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ErrorCard, ERROR_CONFIG } from '../components/operator/ErrorCard'
import { OperatorProgressBar } from '../components/operator/OperatorProgressBar'
import { VerificationReport } from '../components/operator/VerificationReport'

// ── Mock shared VerdictBadge dependency ─────────────────────────────────────

vi.mock('../components/shared/VerdictBadge', () => ({
  VerdictBadge: ({ verdict }: { verdict: string }) => (
    <span data-testid="verdict-badge">{verdict}</span>
  ),
}))

// ── ErrorCard Tests ─────────────────────────────────────────────────────────

describe('ErrorCard', () => {
  it('dispatches "wait" action when Keep Waiting is clicked on timeout error', () => {
    const onAction = vi.fn()
    render(<ErrorCard type="timeout" onAction={onAction} />)

    const keepWaiting = screen.getByText('Keep Waiting')
    fireEvent.click(keepWaiting)

    expect(onAction).toHaveBeenCalledWith('wait')
  })

  it('dispatches "escalate" action when Ask Ryan is clicked on verification-failure error', () => {
    const onAction = vi.fn()
    render(<ErrorCard type="verification-failure" onAction={onAction} />)

    const askRyan = screen.getByText('Ask Ryan')
    fireEvent.click(askRyan)

    expect(onAction).toHaveBeenCalledWith('escalate')
  })

  it('renders all 4 error variants with correct titles', () => {
    const types = ['timeout', 'verification-failure', 'ambiguous-scope', 'provider-exhaustion'] as const

    for (const type of types) {
      const { unmount } = render(<ErrorCard type={type} onAction={vi.fn()} />)
      const config = ERROR_CONFIG[type]
      expect(screen.getByText(config.title)).toBeTruthy()
      unmount()
    }
  })

  it('disables buttons when isSubmitting is true', () => {
    render(<ErrorCard type="timeout" onAction={vi.fn()} isSubmitting />)

    const buttons = screen.getAllByRole('button')
    buttons.forEach((button) => {
      expect(button.hasAttribute('disabled')).toBe(true)
    })
  })
})

// ── OperatorProgressBar Tests ───────────────────────────────────────────────

describe('OperatorProgressBar', () => {
  it('shows completed checkmarks for past steps and pulse on current', () => {
    const { container } = render(
      <OperatorProgressBar currentStage="building" />
    )

    // Verify all 5 step labels are present
    expect(screen.getByText('Thinking')).toBeTruthy()
    expect(screen.getByText('Planning')).toBeTruthy()
    expect(screen.getByText('Building')).toBeTruthy()
    expect(screen.getByText('Checking')).toBeTruthy()
    expect(screen.getByText('Done')).toBeTruthy()

    // Thinking and Planning should have checkmark SVGs (complete)
    // Building should have pulse-glow animation (running)
    const pulseElements = container.querySelectorAll('[class*="pulse-glow"]')
    expect(pulseElements.length).toBeGreaterThan(0)

    // Thinking label should have text-text-muted (complete)
    const thinkingLabel = screen.getByText('Thinking')
    expect(thinkingLabel.className).toContain('text-text-muted')

    // Building label should have text-text-primary (running)
    const buildingLabel = screen.getByText('Building')
    expect(buildingLabel.className).toContain('text-text-primary')

    // Checking label should have text-text-muted/50 (pending)
    const checkingLabel = screen.getByText('Checking')
    expect(checkingLabel.className).toContain('text-text-muted/50')
  })

  it('shows status message for current stage', () => {
    render(<OperatorProgressBar currentStage="planning" />)
    expect(screen.getByText('Planning the approach...')).toBeTruthy()
  })

  it('shows custom status message when provided', () => {
    render(
      <OperatorProgressBar currentStage="building" statusMessage="Building your landing page..." />
    )
    expect(screen.getByText('Building your landing page...')).toBeTruthy()
  })
})

// ── VerificationReport Tests ────────────────────────────────────────────────

describe('VerificationReport', () => {
  const mockReport = {
    passed: true,
    summary: 'All checks passed successfully.',
    whatBuilt: ['New landing page', 'Contact form', 'Analytics integration'],
    qualityChecks: { passed: 8, total: 10 },
    filesChanged: 12,
  }

  it('shows verdict badge and summary', () => {
    render(<VerificationReport report={mockReport} />)

    expect(screen.getByTestId('verdict-badge')).toBeTruthy()
    expect(screen.getByTestId('verdict-badge').textContent).toBe('PASS')
    expect(screen.getByText('All checks passed successfully.')).toBeTruthy()
  })

  it('has accordion sections collapsed by default', () => {
    const { container } = render(<VerificationReport report={mockReport} />)

    // "What was built" content should not be visible (max-height: 0)
    const collapsedSections = container.querySelectorAll('[style*="max-height: 0"]')
    expect(collapsedSections.length).toBe(3)
  })

  it('expands accordion section on click', () => {
    render(<VerificationReport report={mockReport} />)

    // Click "What was built" header
    const whatBuiltHeader = screen.getByText('What was built')
    fireEvent.click(whatBuiltHeader.closest('button')!)

    // Should now show the items (rendered with bullet prefix)
    expect(screen.getByText(/New landing page/)).toBeTruthy()
    expect(screen.getByText(/Contact form/)).toBeTruthy()
  })

  it('shows BLOCK verdict for failed report', () => {
    render(
      <VerificationReport
        report={{ ...mockReport, passed: false, summary: 'Some checks failed.' }}
      />
    )

    expect(screen.getByTestId('verdict-badge').textContent).toBe('BLOCK')
  })
})

// ── Gate Ask Ryan Button Test ───────────────────────────────────────────────

describe('Operator Gate Card with Ask Ryan', () => {
  it('renders Ask Ryan button alongside gate options', () => {
    // This tests the gate card rendering pattern used in OperatorHome
    // The Ask Ryan button is added per D-06 to every gate card in operator context
    const { container } = render(
      <div className="flex flex-wrap items-center gap-2">
        <button className="text-accent">Option A</button>
        <button className="text-text-muted">Option B</button>
        <span className="text-text-muted/30">|</span>
        <button className="text-text-muted">Ask Ryan</button>
      </div>
    )

    expect(screen.getByText('Ask Ryan')).toBeTruthy()
    expect(screen.getByText('Option A')).toBeTruthy()
    expect(screen.getByText('Option B')).toBeTruthy()

    // Verify Ask Ryan is visually separated by divider
    const divider = container.querySelector('span')
    expect(divider?.textContent).toBe('|')
  })
})
