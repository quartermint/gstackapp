import { useEffect, useRef } from "react";
import type { ProjectItem } from "../../lib/grouping.js";

interface CaptureCorrectionProps {
  captureId: string;
  currentProjectId: string | null;
  projects: ProjectItem[];
  onCorrected: () => void;
  onClose: () => void;
}

/**
 * Project reassignment dropdown triggered by clicking a capture's project badge.
 *
 * Shows a list of all projects plus "Unlink" option.
 * Clicking a project PATCHes the capture's projectId and calls onCorrected + onClose.
 * Click outside or Esc closes the dropdown.
 */
export function CaptureCorrection({
  captureId,
  currentProjectId,
  projects,
  onCorrected,
  onClose,
}: CaptureCorrectionProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // Close on Esc
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handleSelect(projectId: string | null) {
    try {
      const res = await fetch(`/api/captures/${captureId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });

      if (!res.ok) {
        console.error("Failed to update capture project:", res.status);
        return;
      }

      onCorrected();
      onClose();
    } catch (err) {
      console.error("Failed to update capture project:", err);
    }
  }

  return (
    <div
      ref={dropdownRef}
      className="absolute z-50 mt-1 w-56 bg-surface-elevated dark:bg-surface-elevated-dark shadow-lg rounded-lg border border-warm-gray/20 dark:border-warm-gray/10 max-h-60 overflow-y-auto"
    >
      <div className="py-1">
        {projects.map((project) => (
          <button
            key={project.slug}
            onClick={() => handleSelect(project.slug)}
            className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
              project.slug === currentProjectId
                ? "bg-surface-warm dark:bg-surface-warm-dark text-terracotta font-medium"
                : "text-text-primary dark:text-text-primary-dark hover:bg-surface-warm/50 dark:hover:bg-surface-warm-dark/50"
            }`}
          >
            <span className="truncate block">{project.name}</span>
            <span className="text-[10px] text-text-muted dark:text-text-muted-dark font-mono">
              {project.slug}
            </span>
          </button>
        ))}

        {/* Separator */}
        <div className="border-t border-warm-gray/20 dark:border-warm-gray/10 my-1" />

        {/* Unlink option */}
        <button
          onClick={() => handleSelect(null)}
          className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
            currentProjectId === null
              ? "text-text-muted dark:text-text-muted-dark italic"
              : "text-rust hover:bg-surface-warm/50 dark:hover:bg-surface-warm-dark/50"
          }`}
        >
          Unlink
        </button>
      </div>
    </div>
  );
}
