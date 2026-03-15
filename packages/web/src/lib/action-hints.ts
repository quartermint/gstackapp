/**
 * Maps health check types to actionable git commands.
 * Metadata-aware: uses branch from metadata when available, defaults to "main".
 */
export function getActionCommand(
  checkType: string,
  metadata: Record<string, unknown> | null
): string {
  const branch = (metadata?.branch as string) ?? "main";

  switch (checkType) {
    case "unpushed_commits":
      return `git push origin ${branch}`;
    case "no_remote":
      return "git remote add origin <url>";
    case "broken_tracking":
      return `git branch -u origin/${branch}`;
    case "remote_branch_gone":
      return `git checkout -b ${branch} && git push -u origin ${branch}`;
    case "unpulled_commits":
      return "git pull";
    case "dirty_working_tree":
      return "git stash";
    case "diverged_copies":
      return "git pull --rebase";
    default:
      return "";
  }
}
