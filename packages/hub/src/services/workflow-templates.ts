/**
 * Workflow Templates
 *
 * Pre-defined workflow templates for common CI/CD and development patterns.
 * These templates can be customized with parameters for specific use cases.
 */

import { WorkflowDefinition } from './workflow.js';
import { randomUUID } from 'crypto';

/**
 * Template parameters for build-test-deploy workflow
 */
export interface BuildTestDeployParams {
  /** Project name for identification */
  projectName: string;
  /** Build command (default: npm run build) */
  buildCommand?: string;
  /** Test command (default: npm test) */
  testCommand?: string;
  /** Deploy command (default: npm run deploy) */
  deployCommand?: string;
  /** Deploy environment (default: production) */
  deployEnv?: string;
  /** Step timeout in ms (default: 300000 = 5 min) */
  timeout?: number;
  /** Retry count for each step (default: 1) */
  retryCount?: number;
}

/**
 * Create a Build -> Test -> Deploy pipeline workflow
 *
 * This is a linear workflow where:
 * 1. Build must complete before Test
 * 2. Test must complete before Deploy
 */
export function buildTestDeploy(params: BuildTestDeployParams): WorkflowDefinition {
  const {
    projectName,
    buildCommand = 'npm run build',
    testCommand = 'npm test',
    deployCommand = 'npm run deploy',
    deployEnv = 'production',
    timeout = 300000,
    retryCount = 1,
  } = params;

  return {
    id: `btd-${randomUUID()}`,
    name: `Build-Test-Deploy: ${projectName}`,
    description: `Standard CI/CD pipeline for ${projectName}`,
    defaultTimeout: timeout,
    defaultRetryCount: retryCount,
    steps: [
      {
        id: 'build',
        name: 'Build',
        command: buildCommand,
        env: { NODE_ENV: 'production' },
      },
      {
        id: 'test',
        name: 'Test',
        command: testCommand,
        dependsOn: ['build'],
        env: { NODE_ENV: 'test' },
      },
      {
        id: 'deploy',
        name: 'Deploy',
        command: deployCommand,
        dependsOn: ['test'],
        env: {
          NODE_ENV: 'production',
          DEPLOY_ENV: deployEnv,
        },
      },
    ],
    metadata: {
      template: 'build-test-deploy',
      project: projectName,
    },
  };
}

/**
 * Template parameters for code review workflow
 */
export interface CodeReviewParams {
  /** Project name for identification */
  projectName: string;
  /** Lint command (default: npm run lint) */
  lintCommand?: string;
  /** Type check command (default: npm run typecheck) */
  typeCheckCommand?: string;
  /** Test command (default: npm test) */
  testCommand?: string;
  /** Whether lint failures should block (default: true) */
  lintBlocking?: boolean;
  /** Step timeout in ms (default: 180000 = 3 min) */
  timeout?: number;
}

/**
 * Create a code review workflow: Lint -> Type Check -> Test
 *
 * This workflow runs quality checks in sequence:
 * 1. Lint for code style
 * 2. Type check for type safety
 * 3. Test for functionality
 *
 * Lint can optionally be non-blocking (continue on failure)
 */
export function codeReview(params: CodeReviewParams): WorkflowDefinition {
  const {
    projectName,
    lintCommand = 'npm run lint',
    typeCheckCommand = 'npm run typecheck',
    testCommand = 'npm test',
    lintBlocking = true,
    timeout = 180000,
  } = params;

  return {
    id: `cr-${randomUUID()}`,
    name: `Code Review: ${projectName}`,
    description: `Quality checks for ${projectName}`,
    defaultTimeout: timeout,
    steps: [
      {
        id: 'lint',
        name: 'Lint',
        command: lintCommand,
        continueOnFailure: !lintBlocking,
      },
      {
        id: 'typecheck',
        name: 'Type Check',
        command: typeCheckCommand,
        dependsOn: ['lint'],
      },
      {
        id: 'test',
        name: 'Test',
        command: testCommand,
        dependsOn: ['typecheck'],
        retryCount: 1, // Tests can be flaky, allow 1 retry
      },
    ],
    metadata: {
      template: 'code-review',
      project: projectName,
    },
  };
}

/**
 * Template parameters for release workflow
 */
export interface ReleaseParams {
  /** Project name for identification */
  projectName: string;
  /** Version bump type (major, minor, patch) */
  versionBump: 'major' | 'minor' | 'patch';
  /** Version bump command template (default: npm version {version}) */
  versionCommand?: string;
  /** Build command (default: npm run build) */
  buildCommand?: string;
  /** Test command (default: npm test) */
  testCommand?: string;
  /** Publish command (default: npm publish) */
  publishCommand?: string;
  /** NPM registry (default: default registry) */
  registry?: string;
  /** Step timeout in ms (default: 300000 = 5 min) */
  timeout?: number;
}

/**
 * Create a release workflow: Version Bump -> Build -> Test -> Publish
 *
 * This workflow handles the complete release process:
 * 1. Bump version according to semver
 * 2. Build the project
 * 3. Run tests to verify
 * 4. Publish to registry
 */
export function release(params: ReleaseParams): WorkflowDefinition {
  const {
    projectName,
    versionBump,
    versionCommand = `npm version ${params.versionBump}`,
    buildCommand = 'npm run build',
    testCommand = 'npm test',
    publishCommand = 'npm publish',
    registry,
    timeout = 300000,
  } = params;

  const publishEnv: Record<string, string> = { NODE_ENV: 'production' };
  if (registry) {
    publishEnv['NPM_REGISTRY'] = registry;
  }

  return {
    id: `rel-${randomUUID()}`,
    name: `Release: ${projectName} (${versionBump})`,
    description: `${versionBump} release for ${projectName}`,
    defaultTimeout: timeout,
    steps: [
      {
        id: 'version',
        name: 'Version Bump',
        command: versionCommand,
      },
      {
        id: 'build',
        name: 'Build',
        command: buildCommand,
        dependsOn: ['version'],
        env: { NODE_ENV: 'production' },
      },
      {
        id: 'test',
        name: 'Test',
        command: testCommand,
        dependsOn: ['build'],
        env: { NODE_ENV: 'test' },
      },
      {
        id: 'publish',
        name: 'Publish',
        command: publishCommand,
        dependsOn: ['test'],
        env: publishEnv,
      },
    ],
    metadata: {
      template: 'release',
      project: projectName,
      versionBump,
    },
  };
}

/**
 * Template parameters for parallel test workflow
 */
export interface ParallelTestParams {
  /** Project name for identification */
  projectName: string;
  /** Unit test command (default: npm run test:unit) */
  unitTestCommand?: string;
  /** Integration test command (default: npm run test:integration) */
  integrationTestCommand?: string;
  /** E2E test command (default: npm run test:e2e) */
  e2eTestCommand?: string;
  /** Whether to include E2E tests (default: true) */
  includeE2E?: boolean;
  /** Step timeout in ms (default: 300000 = 5 min) */
  timeout?: number;
}

/**
 * Create a parallel test workflow
 *
 * This workflow demonstrates parallel execution:
 * - Build runs first
 * - Unit tests, integration tests, and E2E tests run in parallel after build
 */
export function parallelTest(params: ParallelTestParams): WorkflowDefinition {
  const {
    projectName,
    unitTestCommand = 'npm run test:unit',
    integrationTestCommand = 'npm run test:integration',
    e2eTestCommand = 'npm run test:e2e',
    includeE2E = true,
    timeout = 300000,
  } = params;

  const steps = [
    {
      id: 'build',
      name: 'Build',
      command: 'npm run build',
      env: { NODE_ENV: 'test' },
    },
    {
      id: 'unit-tests',
      name: 'Unit Tests',
      command: unitTestCommand,
      dependsOn: ['build'],
      retryCount: 1,
    },
    {
      id: 'integration-tests',
      name: 'Integration Tests',
      command: integrationTestCommand,
      dependsOn: ['build'],
      retryCount: 1,
    },
  ];

  if (includeE2E) {
    steps.push({
      id: 'e2e-tests',
      name: 'E2E Tests',
      command: e2eTestCommand,
      dependsOn: ['build'],
      retryCount: 2, // E2E tests are often flaky
    });
  }

  return {
    id: `pt-${randomUUID()}`,
    name: `Parallel Tests: ${projectName}`,
    description: `Parallel test suite for ${projectName}`,
    defaultTimeout: timeout,
    steps,
    metadata: {
      template: 'parallel-test',
      project: projectName,
    },
  };
}

/**
 * Template parameters for monorepo workflow
 */
export interface MonorepoParams {
  /** Monorepo name */
  monorepoName: string;
  /** Package names to build/test */
  packages: string[];
  /** Build command template (default: pnpm --filter {pkg} build) */
  buildCommandTemplate?: string;
  /** Test command template (default: pnpm --filter {pkg} test) */
  testCommandTemplate?: string;
  /** Step timeout in ms (default: 300000 = 5 min) */
  timeout?: number;
}

/**
 * Create a monorepo workflow that builds and tests each package
 *
 * Each package gets its own build and test steps.
 * Tests depend on their package's build step.
 * All builds can run in parallel, and tests can run in parallel after their build.
 */
export function monorepo(params: MonorepoParams): WorkflowDefinition {
  const {
    monorepoName,
    packages,
    buildCommandTemplate = 'pnpm --filter {pkg} build',
    testCommandTemplate = 'pnpm --filter {pkg} test',
    timeout = 300000,
  } = params;

  const steps = [];

  for (const pkg of packages) {
    const safePkgId = pkg.replace(/[^a-zA-Z0-9]/g, '-');

    steps.push({
      id: `build-${safePkgId}`,
      name: `Build ${pkg}`,
      command: buildCommandTemplate.replace('{pkg}', pkg),
      env: { NODE_ENV: 'production' },
    });

    steps.push({
      id: `test-${safePkgId}`,
      name: `Test ${pkg}`,
      command: testCommandTemplate.replace('{pkg}', pkg),
      dependsOn: [`build-${safePkgId}`],
      env: { NODE_ENV: 'test' },
      retryCount: 1,
    });
  }

  return {
    id: `mono-${randomUUID()}`,
    name: `Monorepo: ${monorepoName}`,
    description: `Build and test ${packages.length} packages in ${monorepoName}`,
    defaultTimeout: timeout,
    steps,
    metadata: {
      template: 'monorepo',
      monorepo: monorepoName,
      packages,
    },
  };
}

/**
 * Create a custom workflow from a simplified specification
 */
export interface CustomWorkflowSpec {
  /** Workflow name */
  name: string;
  /** Workflow description */
  description?: string;
  /** Steps specified as [id, name, command, dependsOn[]] tuples */
  steps: Array<{
    id: string;
    name: string;
    command: string;
    dependsOn?: string[];
    timeout?: number;
    retryCount?: number;
    continueOnFailure?: boolean;
  }>;
  /** Default timeout for steps */
  defaultTimeout?: number;
  /** Default retry count */
  defaultRetryCount?: number;
}

/**
 * Create a custom workflow from a specification
 */
export function custom(spec: CustomWorkflowSpec): WorkflowDefinition {
  return {
    id: `custom-${randomUUID()}`,
    name: spec.name,
    description: spec.description,
    defaultTimeout: spec.defaultTimeout,
    defaultRetryCount: spec.defaultRetryCount,
    steps: spec.steps,
    metadata: {
      template: 'custom',
    },
  };
}
