import { useState } from "react";
import type { Machine } from "../../hooks/use-machines.js";

interface PortRegisterFormProps {
  machines: Machine[];
  onSubmit: (data: {
    port: number;
    machineId: string;
    serviceName: string;
    projectSlug?: string;
  }) => Promise<unknown>;
  isPending: boolean;
  error: string | null;
  onClose: () => void;
}

export function PortRegisterForm({
  machines,
  onSubmit,
  isPending,
  error,
  onClose,
}: PortRegisterFormProps) {
  const [port, setPort] = useState("");
  const [machineId, setMachineId] = useState(machines[0]?.id ?? "");
  const [serviceName, setServiceName] = useState("");
  const [projectSlug, setProjectSlug] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const portNum = parseInt(port, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) return;
    if (!serviceName.trim()) return;

    try {
      await onSubmit({
        port: portNum,
        machineId,
        serviceName: serviceName.trim(),
        projectSlug: projectSlug.trim() || undefined,
      });
      onClose();
    } catch {
      // error is displayed via error prop
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        role="button"
        tabIndex={0}
        aria-label="Close"
      />
      <div className="relative bg-surface-elevated dark:bg-surface-elevated-dark rounded-lg border border-warm-gray/20 p-6 w-full max-w-md shadow-xl">
        <h2 className="text-lg font-semibold mb-4">Register Port</h2>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-text-muted dark:text-text-muted-dark block mb-1">
              Port
            </label>
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              min={1}
              max={65535}
              required
              className="w-full px-3 py-2 text-sm rounded-lg border border-warm-gray/20 bg-surface dark:bg-surface-dark focus:outline-none focus:ring-1 focus:ring-terracotta"
              placeholder="3000"
            />
          </div>

          <div>
            <label className="text-xs text-text-muted dark:text-text-muted-dark block mb-1">
              Machine
            </label>
            <select
              value={machineId}
              onChange={(e) => setMachineId(e.target.value)}
              required
              className="w-full px-3 py-2 text-sm rounded-lg border border-warm-gray/20 bg-surface dark:bg-surface-dark focus:outline-none focus:ring-1 focus:ring-terracotta"
            >
              {machines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.hostname}
                  {m.tailnetIp ? ` (${m.tailnetIp})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-text-muted dark:text-text-muted-dark block mb-1">
              Service Name
            </label>
            <input
              type="text"
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
              required
              className="w-full px-3 py-2 text-sm rounded-lg border border-warm-gray/20 bg-surface dark:bg-surface-dark focus:outline-none focus:ring-1 focus:ring-terracotta"
              placeholder="My API Server"
            />
          </div>

          <div>
            <label className="text-xs text-text-muted dark:text-text-muted-dark block mb-1">
              Project Slug (optional)
            </label>
            <input
              type="text"
              value={projectSlug}
              onChange={(e) => setProjectSlug(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-warm-gray/20 bg-surface dark:bg-surface-dark focus:outline-none focus:ring-1 focus:ring-terracotta"
              placeholder="my-project"
            />
          </div>

          {error && (
            <p className="text-xs text-rust">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm rounded-lg text-text-secondary dark:text-text-secondary-dark hover:bg-surface-warm dark:hover:bg-surface-warm-dark transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-1.5 text-sm rounded-lg bg-terracotta text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {isPending ? "Registering..." : "Register"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
