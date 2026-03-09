import { useEffect, useState } from "react";
import "./app.css";

interface ProjectData {
  slug: string;
  name: string;
  tagline: string | null;
  branch: string | null;
  dirty: boolean | null;
  dirtyFiles: string[];
  lastCommitMessage: string | null;
  lastCommitTime: string | null;
}

interface HealthData {
  status: string;
  timestamp: number;
  version: string;
}

export function App() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [healthRes, projectsRes] = await Promise.all([
          fetch("/api/health"),
          fetch("/api/projects"),
        ]);

        if (healthRes.ok) {
          setHealth(await healthRes.json());
        }

        if (projectsRes.ok) {
          const data = await projectsRes.json();
          setProjects(data.projects ?? []);
        }
      } catch {
        setError("API unreachable");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-lg text-neutral-400">Loading...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-red-400">{error}</p>
          <p className="text-sm text-neutral-500 mt-2">
            Make sure the API server is running on port 3000
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8 max-w-4xl mx-auto">
      <header className="flex items-center gap-3 mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Mission Control</h1>
        {health && (
          <span
            className="inline-flex items-center gap-1.5 text-xs text-neutral-400"
            title={`API v${health.version}`}
          >
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
            API healthy
          </span>
        )}
      </header>

      <section>
        <h2 className="text-lg font-semibold text-neutral-300 mb-4">
          Projects{" "}
          <span className="text-sm font-normal text-neutral-500">
            ({projects.length})
          </span>
        </h2>

        {projects.length === 0 ? (
          <p className="text-neutral-500">
            No projects found. Add projects to mc.config.json and restart the
            API.
          </p>
        ) : (
          <ul className="space-y-3">
            {projects.map((project) => (
              <li
                key={project.slug}
                className="border border-neutral-800 rounded-lg p-4 hover:border-neutral-700 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium text-white">{project.name}</h3>
                    {project.tagline && (
                      <p className="text-sm text-neutral-500 mt-0.5">
                        {project.tagline}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {project.branch && (
                      <span className="text-xs bg-neutral-800 text-neutral-300 px-2 py-0.5 rounded font-mono">
                        {project.branch}
                      </span>
                    )}
                    {project.dirty && (
                      <span className="text-xs text-amber-400" title="Uncommitted changes">
                        *
                      </span>
                    )}
                  </div>
                </div>
                {project.lastCommitMessage && (
                  <p className="text-sm text-neutral-400 mt-2 truncate">
                    {project.lastCommitMessage}
                    {project.lastCommitTime && (
                      <span className="text-neutral-600 ml-2">
                        {project.lastCommitTime}
                      </span>
                    )}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
