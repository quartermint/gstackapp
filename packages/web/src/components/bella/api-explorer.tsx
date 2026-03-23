interface ApiExplorerProps {
  open: boolean;
  onClose: () => void;
}

interface EndpointInfo {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  desc: string;
}

const ENDPOINT_GROUPS: { label: string; endpoints: EndpointInfo[] }[] = [
  {
    label: "Projects",
    endpoints: [
      { method: "GET", path: "/api/projects", desc: "List all projects with status grouping" },
      { method: "GET", path: "/api/projects/:slug", desc: "Get a project's details, commits, and health" },
    ],
  },
  {
    label: "Captures",
    endpoints: [
      { method: "GET", path: "/api/captures", desc: "List captures (filter by project, type, status)" },
      { method: "POST", path: "/api/captures", desc: "Create a new capture (thought, link, task)" },
    ],
  },
  {
    label: "Search",
    endpoints: [
      { method: "GET", path: "/api/search?q=...", desc: "Full-text + semantic search across everything" },
    ],
  },
  {
    label: "Intelligence",
    endpoints: [
      { method: "GET", path: "/api/intelligence/digest", desc: "Daily digest of overnight activity" },
      { method: "GET", path: "/api/intelligence/insights", desc: "Proactive insights (stale, gaps, patterns)" },
    ],
  },
  {
    label: "Sessions",
    endpoints: [
      { method: "GET", path: "/api/sessions", desc: "Active Claude Code sessions" },
    ],
  },
  {
    label: "Health",
    endpoints: [
      { method: "GET", path: "/api/health", desc: "API health status" },
      { method: "GET", path: "/api/health-checks", desc: "Git health findings across projects" },
    ],
  },
];

const SUGGESTIONS = [
  "What projects are active?",
  "Tell me about mission-control",
  "What happened overnight?",
  "Search for anything about captures",
  "Remember: I want to explore the openefb codebase",
];

const METHOD_COLORS: Record<string, string> = {
  GET: "text-sage",
  POST: "text-terracotta",
  PATCH: "text-amber-warm",
  DELETE: "text-rust",
};

export function ApiExplorer({ open, onClose }: ApiExplorerProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-sm bg-surface-elevated dark:bg-surface-elevated-dark border-l border-warm-gray/10 dark:border-warm-gray/6 shadow-xl z-40 overflow-y-auto animate-fade-in">
      <div className="p-5">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display italic text-lg">API Explorer</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted dark:text-text-muted-dark hover:text-text-primary dark:hover:text-text-primary-dark transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-sm text-text-secondary dark:text-text-secondary-dark mb-6 leading-relaxed">
          Mission Control exposes a REST API that any client can use. The dashboard, CLI, iOS app, and this chat all use the same API.
        </p>

        {/* Endpoint groups */}
        <div className="space-y-5">
          {ENDPOINT_GROUPS.map((group) => (
            <div key={group.label}>
              <h3 className="text-[11px] uppercase font-semibold tracking-widest text-text-muted dark:text-text-muted-dark mb-2">
                {group.label}
              </h3>
              <div className="space-y-1.5">
                {group.endpoints.map((ep) => (
                  <div
                    key={ep.path}
                    className="rounded-lg bg-surface dark:bg-surface-dark p-2.5 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`font-mono font-bold ${METHOD_COLORS[ep.method] ?? "text-text-muted"}`}>
                        {ep.method}
                      </span>
                      <code className="font-mono text-text-primary dark:text-text-primary-dark">
                        {ep.path}
                      </code>
                    </div>
                    <p className="text-text-muted dark:text-text-muted-dark mt-1">{ep.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Try asking suggestions */}
        <div className="mt-8">
          <h3 className="text-[11px] uppercase font-semibold tracking-widest text-text-muted dark:text-text-muted-dark mb-2">
            Try asking
          </h3>
          <div className="space-y-1.5">
            {SUGGESTIONS.map((s) => (
              <div
                key={s}
                className="rounded-lg bg-terracotta/5 dark:bg-terracotta/8 border border-terracotta/10 p-2.5 text-xs text-text-secondary dark:text-text-secondary-dark italic"
              >
                "{s}"
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
