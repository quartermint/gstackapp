import { useState } from "react";
import { usePortMap } from "../../hooks/use-port-map.js";
import { useMachines } from "../../hooks/use-machines.js";
import { usePortConflicts } from "../../hooks/use-port-conflicts.js";
import { usePortRegister } from "../../hooks/use-port-register.js";
import { PortMap } from "./port-map.js";
import { MachineCard } from "./machine-card.js";
import { ConflictList } from "./conflict-list.js";
import { RangeVisualization } from "./range-visualization.js";
import { PortRegisterForm } from "./port-register-form.js";

type Tab = "map" | "machines" | "conflicts" | "ranges";

const TABS: { key: Tab; label: string }[] = [
  { key: "map", label: "Port Map" },
  { key: "machines", label: "Machines" },
  { key: "conflicts", label: "Conflicts" },
  { key: "ranges", label: "Ranges" },
];

export function NetworkPage() {
  const [activeTab, setActiveTab] = useState<Tab>("map");
  const [showRegisterForm, setShowRegisterForm] = useState(false);

  const { portMap, loading: mapLoading, refetch: refetchMap } = usePortMap();
  const { machines, loading: machinesLoading } = useMachines();
  const { conflicts, loading: conflictsLoading } = usePortConflicts();
  const { register, isPending, error: registerError } = usePortRegister(() => {
    refetchMap();
  });

  const conflictCount = conflicts.length;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Network</h2>
        <button
          type="button"
          onClick={() => setShowRegisterForm(true)}
          className="px-3 py-1.5 text-xs rounded-lg bg-terracotta text-white font-medium hover:opacity-90 transition-opacity"
        >
          + Register Port
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-warm-gray/15">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-2 text-sm font-medium transition-colors relative ${
              activeTab === tab.key
                ? "text-terracotta"
                : "text-text-muted dark:text-text-muted-dark hover:text-text-secondary dark:hover:text-text-secondary-dark"
            }`}
          >
            {tab.label}
            {tab.key === "conflicts" && conflictCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold bg-rust text-white rounded-full">
                {conflictCount}
              </span>
            )}
            {activeTab === tab.key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-terracotta rounded-t" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "map" && <PortMap portMap={portMap} loading={mapLoading} />}

      {activeTab === "machines" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {machinesLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-32 bg-surface-warm dark:bg-surface-warm-dark rounded-lg animate-pulse"
              />
            ))
          ) : machines.length === 0 ? (
            <p className="text-text-muted dark:text-text-muted-dark text-sm col-span-full py-4">
              No machines registered yet.
            </p>
          ) : (
            machines.map((machine) => (
              <MachineCard
                key={machine.id}
                machine={machine}
                ports={portMap.filter((p) => p.machineId === machine.id)}
              />
            ))
          )}
        </div>
      )}

      {activeTab === "conflicts" && (
        <ConflictList conflicts={conflicts} loading={conflictsLoading} />
      )}

      {activeTab === "ranges" && <RangeVisualization portMap={portMap} />}

      {/* Register form modal */}
      {showRegisterForm && (
        <PortRegisterForm
          machines={machines}
          onSubmit={register}
          isPending={isPending}
          error={registerError}
          onClose={() => setShowRegisterForm(false)}
        />
      )}
    </div>
  );
}
