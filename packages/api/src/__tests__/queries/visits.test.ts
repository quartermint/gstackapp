import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb } from "../helpers/setup.js";
import type { DatabaseInstance } from "../../db/index.js";
import { getLastVisit, recordVisit } from "../../db/queries/visits.js";

describe("visit queries", () => {
  let instance: DatabaseInstance;

  beforeAll(() => {
    instance = createTestDb();
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  it("recordVisit inserts a new row when clientId does not exist", () => {
    const result = recordVisit(instance.db, "web");
    expect(result).toHaveProperty("clientId", "web");
    expect(result).toHaveProperty("lastVisitAt");
    expect(typeof result.lastVisitAt).toBe("string");
  });

  it("recordVisit on second call copies lastVisitAt to previousVisitAt", () => {
    const first = recordVisit(instance.db, "second-client");
    const firstVisitTime = first.lastVisitAt;

    // Small delay to get a different timestamp
    const second = recordVisit(instance.db, "second-client");
    expect(second.clientId).toBe("second-client");
    expect(second.lastVisitAt).not.toBe(firstVisitTime);

    // Verify the rotation via getLastVisit
    const visit = getLastVisit(instance.db, "second-client");
    expect(visit).not.toBeNull();
    expect(visit!.previousVisitAt).toBe(firstVisitTime);
  });

  it("getLastVisit returns null when no row exists for clientId", () => {
    const result = getLastVisit(instance.db, "nonexistent");
    expect(result).toBeNull();
  });

  it("getLastVisit returns full record when row exists", () => {
    recordVisit(instance.db, "existing-client");
    const result = getLastVisit(instance.db, "existing-client");
    expect(result).not.toBeNull();
    expect(result).toHaveProperty("clientId", "existing-client");
    expect(result).toHaveProperty("lastVisitAt");
    expect(result).toHaveProperty("previousVisitAt");
  });
});
