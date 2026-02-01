import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Mark nodes as offline if no heartbeat received for 3 intervals (3 minutes)
crons.interval(
  "markStaleNodesOffline",
  { minutes: 1 },
  internal.nodes.markStaleOffline
);

export default crons;
