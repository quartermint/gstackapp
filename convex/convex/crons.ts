import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Mark nodes as offline if no heartbeat received for 3 intervals (3 minutes)
crons.interval(
  "markStaleNodesOffline",
  { minutes: 1 },
  internal.nodes.markStaleOffline
);

// Task timeout recovery: mark running tasks that have exceeded their timeout
crons.interval(
  "recoverTimedOutTasks",
  { minutes: 1 },
  internal.tasks.markTimedOut
);

// Dead letter queue processing: move failed tasks with excessive retries to DLQ
crons.interval(
  "processDeadLetterQueue",
  { minutes: 5 },
  internal.tasks.processDeadLetterQueue,
  { maxRetries: 3 }
);

export default crons;
