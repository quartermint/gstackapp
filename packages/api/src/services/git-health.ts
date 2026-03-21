import type {
  HealthFindingInput,
  HealthSeverity,
} from "@mission-control/shared";

// ── HealthScanData Interface ──────────────────────────────────────

/** Git state collected per-repo by the scanner */
export interface HealthScanData {
  slug: string;
  branch: string;
  dirty: boolean;
  remoteUrl: string | null;
  hasRemote: boolean;
  isDetachedHead: boolean;
  hasUpstream: boolean;
  upstreamGone: boolean;
  unpushedCount: number;
  unpulledCount: number;
  headCommit: string | null;
  isPublic: boolean;
}

// ── Guard helpers ─────────────────────────────────────────────────

/** Returns true if upstream-dependent checks should be skipped */
function shouldSkipUpstreamChecks(data: HealthScanData): boolean {
  return (
    !data.hasRemote ||
    data.isDetachedHead ||
    !data.hasUpstream ||
    data.upstreamGone
  );
}

// ── Individual Check Functions ────────────────────────────────────

/** HLTH-02: Detects repos with no remote configured */
export function checkNoRemote(data: HealthScanData): HealthFindingInput | null {
  if (!data.hasRemote) {
    return {
      projectSlug: data.slug,
      checkType: "no_remote",
      severity: "critical",
      detail: `No remote configured for ${data.slug}`,
    };
  }
  return null;
}

/** HLTH-03: Detects broken tracking (has remote but no upstream) */
export function checkBrokenTracking(
  data: HealthScanData
): HealthFindingInput | null {
  if (
    data.hasRemote &&
    !data.isDetachedHead &&
    !data.hasUpstream &&
    !data.upstreamGone
  ) {
    return {
      projectSlug: data.slug,
      checkType: "broken_tracking",
      severity: "critical",
      detail: `Branch "${data.branch}" has no upstream tracking configured`,
    };
  }
  return null;
}

/** HLTH-04: Detects when upstream branch has been deleted */
export function checkRemoteBranchGone(
  data: HealthScanData
): HealthFindingInput | null {
  if (data.upstreamGone) {
    return {
      projectSlug: data.slug,
      checkType: "remote_branch_gone",
      severity: "critical",
      detail: `Remote branch for "${data.branch}" has been deleted`,
    };
  }
  return null;
}

/** HLTH-01, HLTH-07: Detects unpushed commits with public repo escalation */
export function checkUnpushedCommits(
  data: HealthScanData
): HealthFindingInput | null {
  if (shouldSkipUpstreamChecks(data)) return null;
  if (data.unpushedCount === 0) return null;

  const CRITICAL_THRESHOLD = 6;

  let severity: HealthSeverity =
    data.unpushedCount >= CRITICAL_THRESHOLD ? "critical" : "warning";

  // HLTH-07: Public repos escalate by one tier
  if (data.isPublic && severity === "warning") {
    severity = "critical";
  }

  const publicNote = data.isPublic ? " (public repo)" : "";
  return {
    projectSlug: data.slug,
    checkType: "unpushed_commits",
    severity,
    detail: `${data.unpushedCount} unpushed commit${data.unpushedCount === 1 ? "" : "s"}${publicNote}`,
    metadata: { count: data.unpushedCount, isPublic: data.isPublic },
  };
}

/** HLTH-05: Detects unpulled commits from remote */
export function checkUnpulledCommits(
  data: HealthScanData
): HealthFindingInput | null {
  if (shouldSkipUpstreamChecks(data)) return null;
  if (data.unpulledCount === 0) return null;

  return {
    projectSlug: data.slug,
    checkType: "unpulled_commits",
    severity: "warning",
    detail: `${data.unpulledCount} unpulled commit${data.unpulledCount === 1 ? "" : "s"} from remote`,
    metadata: { count: data.unpulledCount },
  };
}

/** HLTH-06: Detects dirty working tree (initial severity always info) */
export function checkDirtyWorkingTree(
  data: HealthScanData
): HealthFindingInput | null {
  if (!data.dirty) return null;

  return {
    projectSlug: data.slug,
    checkType: "dirty_working_tree",
    severity: "info",
    detail: "Uncommitted changes in working tree",
  };
}

// ── Dependency Drift Detection ─────────────────────────────────────

/** A pair linking a dependent project to one of its dependencies */
export interface DependencyPair {
  dependentSlug: string;
  dependencySlug: string;
}

/**
 * INTEL-03, INTEL-05, INTEL-06: Detects when a dependency project has
 * pushed new commits that the dependent hasn't consumed yet.
 *
 * Pure function — compares current head commits against previous scan cycle.
 * Returns HealthFindingInput[] for each drifted pair.
 *
 * - Skips pairs where either current head is missing (no scan data)
 * - Skips pairs where previous head is null/missing (first scan = baseline)
 * - Only fires when dependency's head changed between scan cycles
 */
export function checkDependencyDrift(
  pairs: DependencyPair[],
  headCommits: Map<string, string | null>,
  previousHeadCommits: Map<string, string | null>
): HealthFindingInput[] {
  const findings: HealthFindingInput[] = [];

  for (const pair of pairs) {
    const dependencyHead = headCommits.get(pair.dependencySlug);
    const dependentHead = headCommits.get(pair.dependentSlug);

    // Skip if either current head is missing (no scan data)
    if (!dependencyHead || !dependentHead) continue;

    // Skip if previous head is null or not present (first scan = baseline)
    const previousDependencyHead = previousHeadCommits.get(
      pair.dependencySlug
    );
    if (!previousDependencyHead) continue;

    // No drift if dependency head hasn't changed
    if (dependencyHead === previousDependencyHead) continue;

    // Dependency advanced — create finding on the dependent project
    findings.push({
      projectSlug: pair.dependentSlug,
      checkType: "dependency_impact",
      severity: "info",
      detail: `Dependency "${pair.dependencySlug}" has new commits (${dependencyHead.slice(0, 7)})`,
      metadata: {
        dependencySlug: pair.dependencySlug,
        dependencyHead,
        dependentHead,
        type: "dependency_drift",
      },
    });
  }

  return findings;
}

/**
 * INTEL-04: Escalates dependency drift severity based on age.
 * Called in post-scan phase to re-upsert with age-based severity.
 *
 * - < 24 hours: info
 * - >= 24 hours, < 168 hours (7 days): warning
 * - >= 168 hours (7 days): critical
 */
export function escalateDependencyDriftSeverity(
  detectedAt: string,
  now?: Date
): HealthSeverity {
  const referenceTime = now ?? new Date();
  const detected = new Date(detectedAt);

  // Invalid date check
  if (isNaN(detected.getTime())) {
    return "info";
  }

  const MS_PER_HOUR = 60 * 60 * 1000;
  const ageHours =
    (referenceTime.getTime() - detected.getTime()) / MS_PER_HOUR;

  if (ageHours >= 168) return "critical";
  if (ageHours >= 24) return "warning";
  return "info";
}

// ── Severity Escalation ───────────────────────────────────────────

/**
 * HLTH-06: Escalates dirty working tree severity based on age.
 * Called in post-scan phase to re-upsert with age-based severity.
 *
 * - < 3 days: info
 * - >= 3 days, < 7 days: warning
 * - >= 7 days: critical
 */
export function escalateDirtySeverity(
  detectedAt: string,
  now?: Date
): HealthSeverity {
  const referenceTime = now ?? new Date();
  const detected = new Date(detectedAt);

  // Invalid date check
  if (isNaN(detected.getTime())) {
    return "info";
  }

  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const ageDays = (referenceTime.getTime() - detected.getTime()) / MS_PER_DAY;

  if (ageDays >= 7) return "critical";
  if (ageDays >= 3) return "warning";
  return "info";
}

// ── Remote URL Normalization ──────────────────────────────────────

/**
 * COPY-01: Normalizes remote URLs so SSH and HTTPS variants
 * of the same repo produce identical strings.
 *
 * git@github.com:owner/repo.git -> github.com/owner/repo
 * https://github.com/owner/repo.git -> github.com/owner/repo
 */
export function normalizeRemoteUrl(url: string): string {
  let normalized = url.toLowerCase().trim();

  // Strip trailing slash
  normalized = normalized.replace(/\/+$/, "");

  // Strip .git suffix
  normalized = normalized.replace(/\.git$/, "");

  // Handle SSH format: git@host:owner/repo
  const sshMatch = normalized.match(/^[^@]+@([^:]+):(.+)$/);
  if (sshMatch && sshMatch[1] && sshMatch[2]) {
    return `${sshMatch[1]}/${sshMatch[2]}`;
  }

  // Handle HTTPS format: https://host/owner/repo
  const httpsMatch = normalized.match(/^https?:\/\/(.+)$/);
  if (httpsMatch && httpsMatch[1]) {
    return httpsMatch[1];
  }

  // Fallback: return as-is
  return normalized;
}

// ── Health Score ──────────────────────────────────────────────────

/**
 * HLTH-08: Maps worst severity across findings to a 0-100 score.
 * - No findings or only info: 100
 * - Worst is warning: 60
 * - Worst is critical: 20
 */
export function computeHealthScore(findings: HealthFindingInput[]): number {
  if (findings.length === 0) return 100;

  const hasCritical = findings.some((f) => f.severity === "critical");
  if (hasCritical) return 20;

  const hasWarning = findings.some((f) => f.severity === "warning");
  if (hasWarning) return 60;

  return 100;
}

// ── Orchestrator ──────────────────────────────────────────────────

/**
 * Runs all health checks in dependency order.
 *
 * Execution order (Pattern 2 from research):
 * 1. no_remote gates everything except dirty
 * 2. detached HEAD gates upstream checks
 * 3. broken_tracking / gone gate unpushed/unpulled
 * 4. dirty_working_tree always runs (independent)
 */
export function runHealthChecks(data: HealthScanData): HealthFindingInput[] {
  const findings: HealthFindingInput[] = [];

  // 1. Check no remote (gates all remote-dependent checks)
  const noRemote = checkNoRemote(data);
  if (noRemote) {
    findings.push(noRemote);
    // Only dirty working tree is independent of remote state
    const dirty = checkDirtyWorkingTree(data);
    if (dirty) findings.push(dirty);
    return findings;
  }

  // 2. If detached HEAD, skip all upstream-dependent checks
  if (data.isDetachedHead) {
    const dirty = checkDirtyWorkingTree(data);
    if (dirty) findings.push(dirty);
    return findings;
  }

  // 3. Check broken tracking and gone (gate unpushed/unpulled)
  const brokenTracking = checkBrokenTracking(data);
  const gone = checkRemoteBranchGone(data);

  if (brokenTracking) findings.push(brokenTracking);
  if (gone) findings.push(gone);

  // 4. Only check unpushed/unpulled if tracking is healthy
  if (!brokenTracking && !gone) {
    const unpushed = checkUnpushedCommits(data);
    if (unpushed) findings.push(unpushed);

    const unpulled = checkUnpulledCommits(data);
    if (unpulled) findings.push(unpulled);
  }

  // 5. Dirty working tree always runs
  const dirty = checkDirtyWorkingTree(data);
  if (dirty) findings.push(dirty);

  return findings;
}
