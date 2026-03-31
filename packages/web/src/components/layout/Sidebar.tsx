/**
 * Left sidebar: 220px width, gstackapp branding, navigation.
 * Per DESIGN.md: persistent left sidebar (200-240px).
 */
export function Sidebar() {
  return (
    <aside className="w-[220px] bg-surface border-r border-border flex flex-col h-screen">
      {/* Logo / Wordmark */}
      <div className="px-4 py-5">
        <span className="font-display text-accent font-semibold text-lg tracking-[-0.02em]">
          gstackapp
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 space-y-0.5">
        <a
          href="#"
          className="flex items-center gap-2 px-3 py-2 rounded-md text-accent bg-accent-muted font-body text-sm"
        >
          Dashboard
        </a>
        <a
          href="#"
          className="flex items-center gap-2 px-3 py-2 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover font-body text-sm transition-colors duration-150"
        >
          Repositories
        </a>
      </nav>

      {/* Version */}
      <div className="px-4 py-3 border-t border-border">
        <span className="font-mono text-[11px] text-text-muted uppercase tracking-[0.06em]">
          v0.1.0
        </span>
      </div>
    </aside>
  )
}
