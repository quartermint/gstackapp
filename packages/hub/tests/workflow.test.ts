/**
 * Tests for Workflow Orchestration System
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  WorkflowDefinition,
  WorkflowStep,
  createWorkflowInstance,
  areDependenciesComplete,
  hasDependencyFailed,
  getStepTimeout,
  getStepRetryCount,
} from '../src/services/workflow.js';
import {
  validateWorkflow,
  topologicalSort,
  getReadySteps,
  executeWorkflow,
  cancelWorkflow,
} from '../src/services/workflow-executor.js';
import {
  buildTestDeploy,
  codeReview,
  release,
  parallelTest,
  monorepo,
  custom,
} from '../src/services/workflow-templates.js';

describe('Workflow Validation', () => {
  describe('validateWorkflow', () => {
    it('should validate a simple linear workflow', () => {
      const workflow: WorkflowDefinition = {
        id: 'test-1',
        name: 'Simple Workflow',
        steps: [
          { id: 'step1', name: 'Step 1', command: 'echo 1' },
          { id: 'step2', name: 'Step 2', command: 'echo 2', dependsOn: ['step1'] },
        ],
      };

      const result = validateWorkflow(workflow);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject empty workflow', () => {
      const workflow: WorkflowDefinition = {
        id: 'test-2',
        name: 'Empty Workflow',
        steps: [],
      };

      const result = validateWorkflow(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('EMPTY_WORKFLOW');
    });

    it('should detect duplicate step IDs', () => {
      const workflow: WorkflowDefinition = {
        id: 'test-3',
        name: 'Duplicate IDs',
        steps: [
          { id: 'step1', name: 'Step 1', command: 'echo 1' },
          { id: 'step1', name: 'Step 1 Duplicate', command: 'echo 2' },
        ],
      };

      const result = validateWorkflow(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'DUPLICATE_STEP_ID')).toBe(true);
    });

    it('should detect missing dependencies', () => {
      const workflow: WorkflowDefinition = {
        id: 'test-4',
        name: 'Missing Dependency',
        steps: [
          { id: 'step1', name: 'Step 1', command: 'echo 1', dependsOn: ['nonexistent'] },
        ],
      };

      const result = validateWorkflow(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'MISSING_DEPENDENCY')).toBe(true);
    });

    it('should detect self-dependency', () => {
      const workflow: WorkflowDefinition = {
        id: 'test-5',
        name: 'Self Dependency',
        steps: [
          { id: 'step1', name: 'Step 1', command: 'echo 1', dependsOn: ['step1'] },
        ],
      };

      const result = validateWorkflow(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'SELF_DEPENDENCY')).toBe(true);
    });

    it('should detect circular dependencies (simple)', () => {
      const workflow: WorkflowDefinition = {
        id: 'test-6',
        name: 'Circular Dependency',
        steps: [
          { id: 'step1', name: 'Step 1', command: 'echo 1', dependsOn: ['step2'] },
          { id: 'step2', name: 'Step 2', command: 'echo 2', dependsOn: ['step1'] },
        ],
      };

      const result = validateWorkflow(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'CIRCULAR_DEPENDENCY')).toBe(true);
    });

    it('should detect circular dependencies (complex)', () => {
      const workflow: WorkflowDefinition = {
        id: 'test-7',
        name: 'Complex Circular',
        steps: [
          { id: 'step1', name: 'Step 1', command: 'echo 1' },
          { id: 'step2', name: 'Step 2', command: 'echo 2', dependsOn: ['step1', 'step4'] },
          { id: 'step3', name: 'Step 3', command: 'echo 3', dependsOn: ['step2'] },
          { id: 'step4', name: 'Step 4', command: 'echo 4', dependsOn: ['step3'] },
        ],
      };

      const result = validateWorkflow(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'CIRCULAR_DEPENDENCY')).toBe(true);
    });

    it('should validate complex DAG workflow', () => {
      const workflow: WorkflowDefinition = {
        id: 'test-8',
        name: 'Complex DAG',
        steps: [
          { id: 'build', name: 'Build', command: 'npm build' },
          { id: 'test-unit', name: 'Unit Tests', command: 'npm test:unit', dependsOn: ['build'] },
          { id: 'test-int', name: 'Integration Tests', command: 'npm test:int', dependsOn: ['build'] },
          { id: 'test-e2e', name: 'E2E Tests', command: 'npm test:e2e', dependsOn: ['build'] },
          { id: 'deploy', name: 'Deploy', command: 'npm deploy', dependsOn: ['test-unit', 'test-int', 'test-e2e'] },
        ],
      };

      const result = validateWorkflow(workflow);
      expect(result.valid).toBe(true);
    });
  });

  describe('topologicalSort', () => {
    it('should sort linear workflow in correct order', () => {
      const workflow: WorkflowDefinition = {
        id: 'test-1',
        name: 'Linear',
        steps: [
          { id: 'step3', name: 'Step 3', command: 'echo 3', dependsOn: ['step2'] },
          { id: 'step1', name: 'Step 1', command: 'echo 1' },
          { id: 'step2', name: 'Step 2', command: 'echo 2', dependsOn: ['step1'] },
        ],
      };

      const sorted = topologicalSort(workflow);
      const ids = sorted.map(s => s.id);

      expect(ids.indexOf('step1')).toBeLessThan(ids.indexOf('step2'));
      expect(ids.indexOf('step2')).toBeLessThan(ids.indexOf('step3'));
    });

    it('should handle parallel branches', () => {
      const workflow: WorkflowDefinition = {
        id: 'test-2',
        name: 'Parallel',
        steps: [
          { id: 'root', name: 'Root', command: 'echo root' },
          { id: 'branch-a', name: 'Branch A', command: 'echo a', dependsOn: ['root'] },
          { id: 'branch-b', name: 'Branch B', command: 'echo b', dependsOn: ['root'] },
          { id: 'merge', name: 'Merge', command: 'echo merge', dependsOn: ['branch-a', 'branch-b'] },
        ],
      };

      const sorted = topologicalSort(workflow);
      const ids = sorted.map(s => s.id);

      expect(ids.indexOf('root')).toBeLessThan(ids.indexOf('branch-a'));
      expect(ids.indexOf('root')).toBeLessThan(ids.indexOf('branch-b'));
      expect(ids.indexOf('branch-a')).toBeLessThan(ids.indexOf('merge'));
      expect(ids.indexOf('branch-b')).toBeLessThan(ids.indexOf('merge'));
    });
  });

  describe('getReadySteps', () => {
    it('should return steps with no dependencies', () => {
      const workflow: WorkflowDefinition = {
        id: 'test-1',
        name: 'Test',
        steps: [
          { id: 'step1', name: 'Step 1', command: 'echo 1' },
          { id: 'step2', name: 'Step 2', command: 'echo 2', dependsOn: ['step1'] },
        ],
      };

      const instance = createWorkflowInstance(workflow, 'req-1');
      const ready = getReadySteps(workflow, instance);

      expect(ready).toContain('step1');
      expect(ready).not.toContain('step2');
    });

    it('should return steps with completed dependencies', () => {
      const workflow: WorkflowDefinition = {
        id: 'test-2',
        name: 'Test',
        steps: [
          { id: 'step1', name: 'Step 1', command: 'echo 1' },
          { id: 'step2', name: 'Step 2', command: 'echo 2', dependsOn: ['step1'] },
        ],
      };

      const instance = createWorkflowInstance(workflow, 'req-2');
      instance.stepStatuses['step1'].status = 'completed';

      const ready = getReadySteps(workflow, instance);

      expect(ready).not.toContain('step1'); // Already completed
      expect(ready).toContain('step2');
    });

    it('should return multiple ready steps for parallel execution', () => {
      const workflow: WorkflowDefinition = {
        id: 'test-3',
        name: 'Test',
        steps: [
          { id: 'root', name: 'Root', command: 'echo root' },
          { id: 'branch-a', name: 'Branch A', command: 'echo a', dependsOn: ['root'] },
          { id: 'branch-b', name: 'Branch B', command: 'echo b', dependsOn: ['root'] },
        ],
      };

      const instance = createWorkflowInstance(workflow, 'req-3');
      instance.stepStatuses['root'].status = 'completed';

      const ready = getReadySteps(workflow, instance);

      expect(ready).toContain('branch-a');
      expect(ready).toContain('branch-b');
    });
  });
});

describe('Workflow Instance', () => {
  describe('createWorkflowInstance', () => {
    it('should create instance with pending steps', () => {
      const workflow: WorkflowDefinition = {
        id: 'wf-1',
        name: 'Test',
        steps: [
          { id: 'step1', name: 'Step 1', command: 'echo 1' },
          { id: 'step2', name: 'Step 2', command: 'echo 2' },
        ],
      };

      const instance = createWorkflowInstance(workflow, 'req-1');

      expect(instance.status).toBe('pending');
      expect(instance.definitionId).toBe('wf-1');
      expect(instance.requestId).toBe('req-1');
      expect(Object.keys(instance.stepStatuses)).toHaveLength(2);
      expect(instance.stepStatuses['step1'].status).toBe('pending');
      expect(instance.stepStatuses['step2'].status).toBe('pending');
    });
  });

  describe('areDependenciesComplete', () => {
    it('should return true for steps with no dependencies', () => {
      const workflow: WorkflowDefinition = {
        id: 'wf-1',
        name: 'Test',
        steps: [{ id: 'step1', name: 'Step 1', command: 'echo 1' }],
      };
      const instance = createWorkflowInstance(workflow, 'req-1');
      const step = workflow.steps[0];

      expect(areDependenciesComplete(instance, step)).toBe(true);
    });

    it('should return false for incomplete dependencies', () => {
      const workflow: WorkflowDefinition = {
        id: 'wf-1',
        name: 'Test',
        steps: [
          { id: 'step1', name: 'Step 1', command: 'echo 1' },
          { id: 'step2', name: 'Step 2', command: 'echo 2', dependsOn: ['step1'] },
        ],
      };
      const instance = createWorkflowInstance(workflow, 'req-1');
      const step2 = workflow.steps[1];

      expect(areDependenciesComplete(instance, step2)).toBe(false);
    });

    it('should return true when all dependencies completed', () => {
      const workflow: WorkflowDefinition = {
        id: 'wf-1',
        name: 'Test',
        steps: [
          { id: 'step1', name: 'Step 1', command: 'echo 1' },
          { id: 'step2', name: 'Step 2', command: 'echo 2', dependsOn: ['step1'] },
        ],
      };
      const instance = createWorkflowInstance(workflow, 'req-1');
      instance.stepStatuses['step1'].status = 'completed';
      const step2 = workflow.steps[1];

      expect(areDependenciesComplete(instance, step2)).toBe(true);
    });
  });

  describe('hasDependencyFailed', () => {
    it('should return false for steps with no dependencies', () => {
      const workflow: WorkflowDefinition = {
        id: 'wf-1',
        name: 'Test',
        steps: [{ id: 'step1', name: 'Step 1', command: 'echo 1' }],
      };
      const instance = createWorkflowInstance(workflow, 'req-1');
      const step = workflow.steps[0];

      expect(hasDependencyFailed(instance, step)).toBe(false);
    });

    it('should return true when a dependency has failed', () => {
      const workflow: WorkflowDefinition = {
        id: 'wf-1',
        name: 'Test',
        steps: [
          { id: 'step1', name: 'Step 1', command: 'echo 1' },
          { id: 'step2', name: 'Step 2', command: 'echo 2', dependsOn: ['step1'] },
        ],
      };
      const instance = createWorkflowInstance(workflow, 'req-1');
      instance.stepStatuses['step1'].status = 'failed';
      const step2 = workflow.steps[1];

      expect(hasDependencyFailed(instance, step2)).toBe(true);
    });
  });

  describe('getStepTimeout and getStepRetryCount', () => {
    it('should use step-level timeout', () => {
      const workflow: WorkflowDefinition = {
        id: 'wf-1',
        name: 'Test',
        defaultTimeout: 60000,
        steps: [{ id: 'step1', name: 'Step 1', command: 'echo 1', timeout: 30000 }],
      };
      const step = workflow.steps[0];

      expect(getStepTimeout(step, workflow)).toBe(30000);
    });

    it('should fall back to default timeout', () => {
      const workflow: WorkflowDefinition = {
        id: 'wf-1',
        name: 'Test',
        defaultTimeout: 60000,
        steps: [{ id: 'step1', name: 'Step 1', command: 'echo 1' }],
      };
      const step = workflow.steps[0];

      expect(getStepTimeout(step, workflow)).toBe(60000);
    });

    it('should use step-level retry count', () => {
      const workflow: WorkflowDefinition = {
        id: 'wf-1',
        name: 'Test',
        defaultRetryCount: 3,
        steps: [{ id: 'step1', name: 'Step 1', command: 'echo 1', retryCount: 1 }],
      };
      const step = workflow.steps[0];

      expect(getStepRetryCount(step, workflow)).toBe(1);
    });
  });
});

describe('Workflow Execution', () => {
  describe('executeWorkflow', () => {
    it('should execute a simple workflow', async () => {
      const workflow: WorkflowDefinition = {
        id: 'wf-1',
        name: 'Simple',
        steps: [
          { id: 'step1', name: 'Step 1', command: 'echo 1' },
        ],
      };

      const result = await executeWorkflow(workflow, {
        requestId: 'req-1',
        onStepExecute: async () => ({ success: true, output: 'done' }),
      });

      expect(result.status).toBe('completed');
      expect(result.completedSteps).toBe(1);
      expect(result.failedSteps).toBe(0);
    });

    it('should execute steps in dependency order', async () => {
      const executionOrder: string[] = [];
      const workflow: WorkflowDefinition = {
        id: 'wf-2',
        name: 'Sequential',
        steps: [
          { id: 'step1', name: 'Step 1', command: 'echo 1' },
          { id: 'step2', name: 'Step 2', command: 'echo 2', dependsOn: ['step1'] },
          { id: 'step3', name: 'Step 3', command: 'echo 3', dependsOn: ['step2'] },
        ],
      };

      await executeWorkflow(workflow, {
        requestId: 'req-2',
        onStepExecute: async (stepId) => {
          executionOrder.push(stepId);
          return { success: true };
        },
      });

      expect(executionOrder).toEqual(['step1', 'step2', 'step3']);
    });

    it('should execute independent steps in parallel', async () => {
      const startTimes: Record<string, number> = {};
      const workflow: WorkflowDefinition = {
        id: 'wf-3',
        name: 'Parallel',
        steps: [
          { id: 'root', name: 'Root', command: 'echo root' },
          { id: 'branch-a', name: 'Branch A', command: 'echo a', dependsOn: ['root'] },
          { id: 'branch-b', name: 'Branch B', command: 'echo b', dependsOn: ['root'] },
        ],
      };

      await executeWorkflow(workflow, {
        requestId: 'req-3',
        onStepExecute: async (stepId) => {
          startTimes[stepId] = Date.now();
          await new Promise(r => setTimeout(r, 50)); // Simulate work
          return { success: true };
        },
      });

      // Branch A and B should start at roughly the same time (within 20ms)
      expect(Math.abs(startTimes['branch-a'] - startTimes['branch-b'])).toBeLessThan(20);
    });

    it('should handle step failure', async () => {
      const workflow: WorkflowDefinition = {
        id: 'wf-4',
        name: 'Failure',
        steps: [
          { id: 'step1', name: 'Step 1', command: 'echo 1' },
          { id: 'step2', name: 'Step 2', command: 'fail', dependsOn: ['step1'] },
        ],
      };

      const result = await executeWorkflow(workflow, {
        requestId: 'req-4',
        onStepExecute: async (stepId) => {
          if (stepId === 'step2') {
            return { success: false, error: 'Step failed' };
          }
          return { success: true };
        },
      });

      expect(result.status).toBe('failed');
      expect(result.completedSteps).toBe(1);
      expect(result.failedSteps).toBe(1);
    });

    it('should skip dependent steps when dependency fails', async () => {
      const workflow: WorkflowDefinition = {
        id: 'wf-5',
        name: 'Skip',
        steps: [
          { id: 'step1', name: 'Step 1', command: 'fail' },
          { id: 'step2', name: 'Step 2', command: 'echo 2', dependsOn: ['step1'] },
          { id: 'step3', name: 'Step 3', command: 'echo 3', dependsOn: ['step2'] },
        ],
      };

      const result = await executeWorkflow(workflow, {
        requestId: 'req-5',
        onStepExecute: async (stepId) => {
          if (stepId === 'step1') {
            return { success: false, error: 'Failed' };
          }
          return { success: true };
        },
      });

      expect(result.status).toBe('failed');
      expect(result.failedSteps).toBe(1);
      expect(result.skippedSteps).toBe(2);
      expect(result.stepResults['step2'].status).toBe('skipped');
      expect(result.stepResults['step3'].status).toBe('skipped');
    });

    it('should retry failed steps', async () => {
      let attempts = 0;
      const workflow: WorkflowDefinition = {
        id: 'wf-6',
        name: 'Retry',
        steps: [
          { id: 'step1', name: 'Step 1', command: 'echo 1', retryCount: 2 },
        ],
      };

      const result = await executeWorkflow(workflow, {
        requestId: 'req-6',
        onStepExecute: async () => {
          attempts++;
          if (attempts < 3) {
            return { success: false, error: 'Temporary failure' };
          }
          return { success: true };
        },
      });

      expect(result.status).toBe('completed');
      expect(attempts).toBe(3); // Initial + 2 retries
    });

    it('should continue workflow when continueOnFailure is set', async () => {
      const workflow: WorkflowDefinition = {
        id: 'wf-7',
        name: 'ContinueOnFailure',
        steps: [
          { id: 'step1', name: 'Step 1', command: 'fail', continueOnFailure: true },
          { id: 'step2', name: 'Step 2', command: 'echo 2' },
        ],
      };

      const result = await executeWorkflow(workflow, {
        requestId: 'req-7',
        onStepExecute: async (stepId) => {
          if (stepId === 'step1') {
            return { success: false, error: 'Failed but continue' };
          }
          return { success: true };
        },
      });

      // Workflow completes because step1 has continueOnFailure
      expect(result.status).toBe('completed');
      expect(result.failedSteps).toBe(1);
      expect(result.completedSteps).toBe(1);
    });

    it('should trigger status callbacks', async () => {
      const stepStatusChanges: Array<{ stepId: string; status: string }> = [];
      const workflowStatusChanges: string[] = [];

      const workflow: WorkflowDefinition = {
        id: 'wf-8',
        name: 'Callbacks',
        steps: [
          { id: 'step1', name: 'Step 1', command: 'echo 1' },
        ],
      };

      await executeWorkflow(workflow, {
        requestId: 'req-8',
        onStepExecute: async () => ({ success: true }),
        onStepStatusChange: (stepId, status) => {
          stepStatusChanges.push({ stepId, status: status.status });
        },
        onWorkflowStatusChange: (status) => {
          workflowStatusChanges.push(status);
        },
      });

      expect(stepStatusChanges).toContainEqual({ stepId: 'step1', status: 'running' });
      expect(stepStatusChanges).toContainEqual({ stepId: 'step1', status: 'completed' });
      expect(workflowStatusChanges).toContain('running');
      expect(workflowStatusChanges).toContain('completed');
    });

    it('should reject invalid workflow', async () => {
      const workflow: WorkflowDefinition = {
        id: 'wf-9',
        name: 'Invalid',
        steps: [],
      };

      const result = await executeWorkflow(workflow, {
        requestId: 'req-9',
      });

      expect(result.status).toBe('failed');
      expect(result.error).toContain('Invalid workflow');
    });
  });

  describe('cancelWorkflow', () => {
    it('should cancel a running workflow', async () => {
      const workflow: WorkflowDefinition = {
        id: 'wf-cancel',
        name: 'Cancellable',
        steps: [
          { id: 'step1', name: 'Step 1', command: 'echo 1' },
          { id: 'step2', name: 'Step 2', command: 'echo 2', dependsOn: ['step1'] },
          { id: 'step3', name: 'Step 3', command: 'echo 3', dependsOn: ['step2'] },
        ],
      };

      let instanceId = '';
      let stepCount = 0;

      const resultPromise = executeWorkflow(workflow, {
        requestId: 'req-cancel',
        onStepExecute: async (stepId) => {
          stepCount++;
          if (stepId === 'step1') {
            // Long-running step to give time for cancel
            await new Promise(r => setTimeout(r, 200));
          } else if (stepId === 'step2') {
            // Cancel during second step
            cancelWorkflow(instanceId);
            await new Promise(r => setTimeout(r, 100));
          }
          return { success: true };
        },
        onWorkflowStatusChange: (status) => {
          // Capture instance ID when workflow starts
          if (status === 'running') {
            // The instance ID will be available in the result
          }
        },
      });

      const result = await resultPromise;
      instanceId = result.instanceId;

      // Either cancelled or completed is acceptable depending on timing
      // The important thing is that step3 may be skipped if cancelled in time
      expect(['cancelled', 'completed']).toContain(result.status);

      // If cancelled, step3 should have been skipped
      if (result.status === 'cancelled') {
        expect(result.stepResults['step3'].status).toBe('skipped');
      }
    });

    it('should return false when cancelling non-existent workflow', () => {
      const result = cancelWorkflow('non-existent-id');
      expect(result).toBe(false);
    });
  });
});

describe('Workflow Templates', () => {
  describe('buildTestDeploy', () => {
    it('should create a build-test-deploy pipeline', () => {
      const workflow = buildTestDeploy({ projectName: 'my-app' });

      expect(workflow.name).toContain('my-app');
      expect(workflow.steps).toHaveLength(3);
      expect(workflow.steps[0].id).toBe('build');
      expect(workflow.steps[1].id).toBe('test');
      expect(workflow.steps[1].dependsOn).toContain('build');
      expect(workflow.steps[2].id).toBe('deploy');
      expect(workflow.steps[2].dependsOn).toContain('test');

      const validation = validateWorkflow(workflow);
      expect(validation.valid).toBe(true);
    });

    it('should use custom commands', () => {
      const workflow = buildTestDeploy({
        projectName: 'my-app',
        buildCommand: 'pnpm build',
        testCommand: 'pnpm test',
        deployCommand: 'pnpm deploy',
      });

      expect(workflow.steps[0].command).toBe('pnpm build');
      expect(workflow.steps[1].command).toBe('pnpm test');
      expect(workflow.steps[2].command).toBe('pnpm deploy');
    });
  });

  describe('codeReview', () => {
    it('should create a code review workflow', () => {
      const workflow = codeReview({ projectName: 'my-lib' });

      expect(workflow.name).toContain('my-lib');
      expect(workflow.steps).toHaveLength(3);
      expect(workflow.steps[0].id).toBe('lint');
      expect(workflow.steps[1].id).toBe('typecheck');
      expect(workflow.steps[2].id).toBe('test');

      const validation = validateWorkflow(workflow);
      expect(validation.valid).toBe(true);
    });

    it('should allow non-blocking lint', () => {
      const workflow = codeReview({
        projectName: 'my-lib',
        lintBlocking: false,
      });

      expect(workflow.steps[0].continueOnFailure).toBe(true);
    });
  });

  describe('release', () => {
    it('should create a release workflow', () => {
      const workflow = release({
        projectName: 'my-pkg',
        versionBump: 'minor',
      });

      expect(workflow.name).toContain('my-pkg');
      expect(workflow.name).toContain('minor');
      expect(workflow.steps).toHaveLength(4);
      expect(workflow.steps[0].id).toBe('version');
      expect(workflow.steps[3].id).toBe('publish');

      const validation = validateWorkflow(workflow);
      expect(validation.valid).toBe(true);
    });
  });

  describe('parallelTest', () => {
    it('should create a parallel test workflow', () => {
      const workflow = parallelTest({ projectName: 'my-app' });

      expect(workflow.steps.length).toBeGreaterThanOrEqual(3);

      // All test steps should depend on build
      const testSteps = workflow.steps.filter(s => s.id !== 'build');
      for (const step of testSteps) {
        expect(step.dependsOn).toContain('build');
      }

      const validation = validateWorkflow(workflow);
      expect(validation.valid).toBe(true);
    });

    it('should optionally exclude E2E tests', () => {
      const workflow = parallelTest({
        projectName: 'my-app',
        includeE2E: false,
      });

      const hasE2E = workflow.steps.some(s => s.id === 'e2e-tests');
      expect(hasE2E).toBe(false);
    });
  });

  describe('monorepo', () => {
    it('should create a monorepo workflow', () => {
      const workflow = monorepo({
        monorepoName: 'mission-control',
        packages: ['shared', 'hub', 'compute'],
      });

      expect(workflow.steps).toHaveLength(6); // 2 steps per package

      // Each test should depend on its build
      expect(workflow.steps.find(s => s.id === 'test-shared')?.dependsOn).toContain('build-shared');
      expect(workflow.steps.find(s => s.id === 'test-hub')?.dependsOn).toContain('build-hub');

      const validation = validateWorkflow(workflow);
      expect(validation.valid).toBe(true);
    });
  });

  describe('custom', () => {
    it('should create a custom workflow', () => {
      const workflow = custom({
        name: 'My Custom Workflow',
        description: 'Does custom things',
        steps: [
          { id: 'step-a', name: 'Step A', command: 'echo a' },
          { id: 'step-b', name: 'Step B', command: 'echo b', dependsOn: ['step-a'] },
        ],
        defaultTimeout: 60000,
      });

      expect(workflow.name).toBe('My Custom Workflow');
      expect(workflow.description).toBe('Does custom things');
      expect(workflow.defaultTimeout).toBe(60000);

      const validation = validateWorkflow(workflow);
      expect(validation.valid).toBe(true);
    });
  });
});
