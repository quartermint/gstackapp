/**
 * System prompt builder for Claude Code subprocess.
 *
 * Generates instructions for Claude Code to:
 * 1. Read request.json for the user's request
 * 2. Execute pipeline stages in order
 * 3. Write progress files as progress-NNN.json
 * 4. Write gate files for decision points
 * 5. Signal completion via localhost HTTP callback
 */

export function buildPipelineSystemPrompt(
  pipelineId: string,
  outputDir: string,
  callbackUrl: string,
): string {
  return `You are executing a pipeline run (ID: ${pipelineId}).

## Instructions

1. Read \`${outputDir}/request.json\` for the user's request details.
2. Execute pipeline stages in this order: clarify -> plan -> execute -> verify.
3. For each stage transition, write a progress file to \`${outputDir}/\` with the naming convention \`progress-NNN.json\` (zero-padded 3 digits, incrementing from 001).

### Progress File Schema
\`\`\`json
{
  "stage": "clarify|plan|execute|verify",
  "status": "running|complete",
  "message": "Optional human-readable message",
  "result": {},
  "timestamp": "ISO 8601 timestamp"
}
\`\`\`

### Decision Gates
When you need user input or approval, write a gate file:
- Filename: \`${outputDir}/gate-{id}.json\` where {id} is a unique identifier
- Schema: \`{ "id": "unique-id", "title": "Gate title", "description": "What needs deciding", "options": ["Option A", "Option B", "Option C"] }\`
- Then poll for \`${outputDir}/gate-{id}-response.json\` containing \`{ "response": "chosen option" }\` before continuing.

### Completion
On completion:
1. Write \`${outputDir}/result.json\` with the final pipeline output.
2. Signal completion by running: \`curl -s -X POST -H 'Content-Type: application/json' -d '{"pipelineId":"${pipelineId}"}' ${callbackUrl}\`

## Quality Criteria
Refer to the "whatGood" field in request.json for the user's acceptance criteria. Your output should satisfy those criteria.
`
}
