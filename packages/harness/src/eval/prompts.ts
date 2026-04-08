/**
 * Eval prompt sets organized by task type.
 *
 * Each prompt is designed to exercise specific capabilities relevant to its task type.
 * The scorer uses the rubric to assess response quality.
 */

export interface EvalPrompt {
  id: string
  taskType: string
  system: string
  userMessage: string
  expectedCapabilities: string[]  // What capabilities are needed
  rubric: string[]                // Scoring criteria
}

export const EVAL_PROMPTS: EvalPrompt[] = [
  // Scaffolding (2 prompts)
  {
    id: 'scaffold-01',
    taskType: 'scaffolding',
    system: 'You are a code generation assistant.',
    userMessage: 'Create a TypeScript function that validates an email address using a regex pattern. Export it as `validateEmail`.',
    expectedCapabilities: ['code-generation', 'typescript', 'regex'],
    rubric: ['Function exported correctly', 'Regex handles common email formats', 'TypeScript types present', 'No runtime errors'],
  },
  {
    id: 'scaffold-02',
    taskType: 'scaffolding',
    system: 'You are a code generation assistant.',
    userMessage: 'Create a React component called `LoadingSpinner` that accepts a `size` prop (sm/md/lg) and renders an animated SVG spinner.',
    expectedCapabilities: ['code-generation', 'react', 'svg'],
    rubric: ['Component exported', 'Size prop typed', 'SVG animation present', 'No JSX errors'],
  },
  // Review (2 prompts)
  {
    id: 'review-01',
    taskType: 'review',
    system: 'You are a senior code reviewer. Identify bugs, security issues, and improvement opportunities.',
    userMessage: 'Review this code:\n```typescript\nfunction processPayment(amount: any, userId: string) {\n  const result = eval(`calculateTax(${amount})`)\n  db.query(`UPDATE users SET balance = balance - ${amount} WHERE id = \'${userId}\'`)\n  return result\n}\n```',
    expectedCapabilities: ['code-review', 'security', 'sql-injection', 'eval-detection'],
    rubric: ['Identifies eval() as security risk', 'Identifies SQL injection vulnerability', 'Identifies any type usage', 'Suggests parameterized queries'],
  },
  {
    id: 'review-02',
    taskType: 'review',
    system: 'You are a senior code reviewer.',
    userMessage: 'Review this React component for performance issues:\n```tsx\nfunction UserList({ users }: { users: User[] }) {\n  const sorted = users.sort((a, b) => a.name.localeCompare(b.name))\n  return <ul>{sorted.map(u => <li key={Math.random()}>{u.name}</li>)}</ul>\n}\n```',
    expectedCapabilities: ['react-review', 'performance', 'key-prop'],
    rubric: ['Identifies .sort() mutation', 'Identifies Math.random() key', 'Suggests useMemo', 'Suggests stable key'],
  },
  // Debugging (2 prompts)
  {
    id: 'debug-01',
    taskType: 'debugging',
    system: 'You are a debugging assistant. Identify the root cause and suggest a fix.',
    userMessage: 'My Node.js server crashes with "EMFILE: too many open files" after running for about 2 hours under moderate load. We use Express and fs.createReadStream to serve files. What\'s likely causing this?',
    expectedCapabilities: ['debugging', 'nodejs', 'file-descriptors'],
    rubric: ['Identifies file descriptor leak', 'Mentions stream not being closed or destroyed', 'Suggests fix with stream.destroy or pipeline', 'Mentions ulimit as temporary workaround'],
  },
  {
    id: 'debug-02',
    taskType: 'debugging',
    system: 'You are a debugging assistant.',
    userMessage: 'My React app shows stale data after navigation. When I go from /users/1 to /users/2, I briefly see user 1\'s data before user 2 loads. Using React Query with useParams().',
    expectedCapabilities: ['debugging', 'react', 'react-query', 'stale-data'],
    rubric: ['Identifies query key not including userId', 'Suggests adding userId to query key', 'Mentions placeholderData or keepPreviousData', 'Explains React Query cache behavior'],
  },
  // Ideation (2 prompts)
  {
    id: 'ideation-01',
    taskType: 'ideation',
    system: 'You are a product ideation assistant. Think creatively and expansively.',
    userMessage: 'I want to build a tool that helps solo developers manage their personal knowledge base. What are 5 innovative features that would differentiate it from Notion or Obsidian?',
    expectedCapabilities: ['product-thinking', 'creativity', 'differentiation'],
    rubric: ['5 distinct features listed', 'Features are genuinely different from Notion or Obsidian', 'Each feature has clear user benefit', 'At least one technically novel idea'],
  },
  {
    id: 'ideation-02',
    taskType: 'ideation',
    system: 'You are a product ideation assistant.',
    userMessage: 'How could we add AI capabilities to a personal finance tracking app in ways that go beyond basic categorization and budgeting?',
    expectedCapabilities: ['product-thinking', 'ai-application', 'finance'],
    rubric: ['Multiple AI applications beyond categorization', 'Practical and implementable ideas', 'Considers user privacy', 'At least one predictive or proactive feature'],
  },
]
