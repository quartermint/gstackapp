# Swift Package Coordination

Last Updated: 2026-02-02

## Package Dependency Map

| Package | iOS | macOS | watchOS |
|---------|-----|-------|---------|
| MissionControlModels | Yes | Yes | Yes |
| MissionControlNetworking | Yes | Yes | No |

## Active Package Modifications

(none)

## Rules

1. Before modifying `packages/swift/*`: Update this file and push
2. After modifying: Notify all affected teams
3. Breaking changes require sign-off from all affected app teams

## How to Use

### Declaring Intent

Before making changes to shared packages, add an entry to "Active Package Modifications":

```markdown
### [Branch Name]
- **Package**: MissionControlModels
- **Author**: Your Name
- **Started**: YYYY-MM-DD
- **Description**: Brief description of changes
- **Affected Platforms**: iOS, macOS, watchOS
```

### Completing Changes

1. Remove your entry from "Active Package Modifications"
2. Update "Last Updated" timestamp
3. Commit and push coordination file
4. Run `scripts/notify-package-change.sh <package> <branch>`

## Conflict Resolution

If two developers need to modify the same package simultaneously:

1. Coordinate directly before starting
2. Consider pair programming or sequential changes
3. Use integration branch for complex merges
