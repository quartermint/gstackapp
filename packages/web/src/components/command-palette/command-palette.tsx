import { useState, useEffect, useCallback } from "react";
import { Command } from "cmdk";
import { useRecentCaptures, type CaptureItem } from "../../hooks/use-captures.js";
import type { ProjectItem } from "../../lib/grouping.js";
import { formatRelativeTime } from "../../lib/time.js";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ProjectItem[];
  onCaptureSubmit: (content: string) => void;
  onProjectSelect: (slug: string) => void;
}

type PaletteMode = "capture" | "navigate" | "search";

interface SearchResult {
  type: "capture" | "project" | "commit";
  id: string;
  text: string;
  source: string;
  projectSlug?: string;
}

/**
 * cmdk-powered command palette with mode switching.
 *
 * Modes:
 * - Default (no prefix): capture mode -- type and Enter to capture
 * - '/' prefix: navigate mode -- fuzzy-filter projects
 * - '?' prefix: search mode -- FTS5 search across everything
 *
 * When opened with empty input: shows 5 recent projects + 3 recent captures.
 */
export function CommandPalette({
  open,
  onOpenChange,
  projects,
  onCaptureSubmit,
  onProjectSelect,
}: CommandPaletteProps) {
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const { captures: recentCaptures } = useRecentCaptures(3);

  // Determine mode from search prefix
  const mode: PaletteMode = search.startsWith("/")
    ? "navigate"
    : search.startsWith("?")
      ? "search"
      : "capture";

  // Clear search when palette closes
  useEffect(() => {
    if (!open) {
      setSearch("");
      setSearchResults([]);
    }
  }, [open]);

  // Search mode: fetch from FTS5 endpoint with debounce
  useEffect(() => {
    if (mode !== "search") {
      setSearchResults([]);
      return;
    }

    const query = search.slice(1).trim();
    if (!query) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(() => {
      setSearchLoading(true);
      fetch(`/api/search?q=${encodeURIComponent(query)}`)
        .then((res) => {
          if (!res.ok) throw new Error(`Search failed: ${res.status}`);
          return res.json();
        })
        .then((data) => {
          setSearchResults(
            (data.results ?? []).map((r: Record<string, unknown>) => ({
              type: r.type ?? "capture",
              id: r.id ?? String(Math.random()),
              text: r.rawContent ?? r.text ?? r.message ?? "",
              source: r.source ?? String(r.type ?? "capture"),
              projectSlug: r.projectSlug ?? r.project_slug ?? undefined,
            }))
          );
        })
        .catch((err) => {
          console.error("Palette search failed:", err);
          setSearchResults([]);
        })
        .finally(() => {
          setSearchLoading(false);
        });
    }, 200);

    return () => clearTimeout(timer);
  }, [mode, search]);

  // Get recent projects (sorted by lastCommitDate, take 5)
  const recentProjects = projects
    .slice()
    .sort((a, b) => {
      const aTime = a.lastCommitDate ? new Date(a.lastCommitDate).getTime() : 0;
      const bTime = b.lastCommitDate ? new Date(b.lastCommitDate).getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, 5);

  const handleCaptureSubmit = useCallback(() => {
    const content = search.trim();
    if (content) {
      onCaptureSubmit(content);
      setSearch("");
      onOpenChange(false);
    }
  }, [search, onCaptureSubmit, onOpenChange]);

  const handleProjectSelect = useCallback(
    (slug: string) => {
      onProjectSelect(slug);
      setSearch("");
      onOpenChange(false);
    },
    [onProjectSelect, onOpenChange]
  );

  const handleSearchResultSelect = useCallback(
    (result: SearchResult) => {
      if (result.projectSlug) {
        onProjectSelect(result.projectSlug);
      }
      setSearch("");
      onOpenChange(false);
    },
    [onProjectSelect, onOpenChange]
  );

  const placeholder =
    mode === "navigate"
      ? "Navigate to..."
      : mode === "search"
        ? "Search captures..."
        : "What's on your mind...";

  // In navigate mode, pass the search without the '/' prefix for filtering
  // In search mode, disable cmdk built-in filtering (we handle it via API)
  const shouldFilter = mode === "search" ? false : mode === "navigate";
  const filterValue = mode === "navigate" ? search.slice(1) : undefined;

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Mission Control Command Palette"
      shouldFilter={shouldFilter}
      overlayClassName="fixed inset-0 bg-black/40 z-50 cmdk-overlay"
      contentClassName={[
        "fixed top-1/4 left-1/2 -translate-x-1/2",
        "w-full max-w-lg",
        "bg-surface-elevated dark:bg-surface-elevated-dark",
        "rounded-xl shadow-2xl",
        "border border-warm-gray/20",
        "z-50 cmdk-dialog",
      ].join(" ")}
    >
      <Command.Input
        value={mode === "navigate" ? filterValue : search}
        onValueChange={(v) => {
          // In navigate mode, re-add the '/' prefix
          if (mode === "navigate" && !v.startsWith("/")) {
            setSearch("/" + v);
          } else {
            setSearch(v);
          }
        }}
        placeholder={placeholder}
        className={[
          "w-full px-4 py-3",
          "text-base text-text-primary dark:text-text-primary-dark",
          "bg-transparent border-b border-warm-gray/20",
          "focus:outline-none",
          "placeholder:text-text-muted dark:placeholder:text-text-muted-dark",
        ].join(" ")}
      />

      <Command.List
        className="max-h-80 overflow-y-auto py-2"
      >
        {/* Capture mode */}
        {mode === "capture" && (
          <>
            {search.trim() ? (
              <Command.Group heading="Capture" className="cmdk-group">
                <Command.Item
                  value={`capture-${search}`}
                  onSelect={handleCaptureSubmit}
                  className="cmdk-item"
                >
                  <span className="text-terracotta mr-2">+</span>
                  Press Enter to capture: &ldquo;{search.trim()}&rdquo;
                </Command.Item>
              </Command.Group>
            ) : (
              <>
                {recentProjects.length > 0 && (
                  <Command.Group heading="Recent Projects" className="cmdk-group">
                    {recentProjects.map((project) => (
                      <Command.Item
                        key={project.slug}
                        value={project.slug}
                        onSelect={() => handleProjectSelect(project.slug)}
                        className="cmdk-item"
                      >
                        <span className="font-medium">{project.name}</span>
                        {project.tagline && (
                          <span className="ml-2 text-text-muted dark:text-text-muted-dark text-sm">
                            {project.tagline}
                          </span>
                        )}
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
                {recentCaptures.length > 0 && (
                  <Command.Group heading="Recent Captures" className="cmdk-group">
                    {recentCaptures.map((capture: CaptureItem) => (
                      <Command.Item
                        key={capture.id}
                        value={`recent-capture-${capture.id}`}
                        className="cmdk-item"
                        disabled
                      >
                        <span className="truncate">
                          {capture.rawContent.length > 60
                            ? capture.rawContent.slice(0, 60) + "..."
                            : capture.rawContent}
                        </span>
                        <span className="ml-auto text-xs text-text-muted dark:text-text-muted-dark shrink-0">
                          {formatRelativeTime(capture.createdAt)}
                        </span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
              </>
            )}
          </>
        )}

        {/* Navigate mode */}
        {mode === "navigate" && (
          <Command.Group heading="Projects" className="cmdk-group">
            {projects.map((project) => (
              <Command.Item
                key={project.slug}
                value={project.slug}
                keywords={[project.name, project.tagline ?? ""].filter(Boolean)}
                onSelect={() => handleProjectSelect(project.slug)}
                className="cmdk-item"
              >
                <span className="font-medium">{project.name}</span>
                {project.tagline && (
                  <span className="ml-2 text-text-muted dark:text-text-muted-dark text-sm">
                    {project.tagline}
                  </span>
                )}
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {/* Search mode */}
        {mode === "search" && (
          <>
            {searchLoading && (
              <Command.Loading className="px-3 py-2 text-sm text-text-muted dark:text-text-muted-dark">
                Searching...
              </Command.Loading>
            )}
            {!searchLoading && searchResults.length === 0 && search.slice(1).trim() && (
              <Command.Empty className="px-3 py-6 text-center text-sm text-text-muted dark:text-text-muted-dark">
                No results found.
              </Command.Empty>
            )}
            {searchResults.length > 0 && (
              <Command.Group heading="Results" className="cmdk-group">
                {searchResults.map((result) => (
                  <Command.Item
                    key={result.id}
                    value={`search-${result.id}`}
                    onSelect={() => handleSearchResultSelect(result)}
                    className="cmdk-item"
                  >
                    <span className="truncate">{result.text}</span>
                    <span className="ml-auto text-xs text-text-muted dark:text-text-muted-dark shrink-0 capitalize">
                      {result.source}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </>
        )}
      </Command.List>
    </Command.Dialog>
  );
}
