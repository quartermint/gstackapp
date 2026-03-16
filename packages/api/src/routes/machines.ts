import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { createMachineSchema, machineIdSchema } from "@mission-control/shared";
import {
  upsertMachine,
  getMachine,
  listMachines,
} from "../db/queries/machines.js";
import { AppError } from "../lib/errors.js";
import type { DatabaseInstance } from "../db/index.js";

export function createMachineRoutes(getInstance: () => DatabaseInstance) {
  return new Hono()
    .get("/machines", (c) => {
      try {
        const result = listMachines(getInstance().db);
        return c.json({ machines: result });
      } catch (e) {
        if (e instanceof AppError) {
          return c.json(
            { error: { code: e.code, message: e.message } },
            e.status as 500
          );
        }
        throw e;
      }
    })
    .post(
      "/machines",
      zValidator("json", createMachineSchema),
      (c) => {
        try {
          const data = c.req.valid("json");
          const machine = upsertMachine(getInstance().db, data);
          return c.json({ machine }, 201);
        } catch (e) {
          if (e instanceof AppError) {
            return c.json(
              { error: { code: e.code, message: e.message } },
              e.status as 400
            );
          }
          throw e;
        }
      }
    )
    .get(
      "/machines/:id",
      zValidator("param", machineIdSchema),
      (c) => {
        try {
          const { id } = c.req.valid("param");
          const machine = getMachine(getInstance().db, id);
          return c.json({ machine });
        } catch (e) {
          if (e instanceof AppError) {
            return c.json(
              { error: { code: e.code, message: e.message } },
              e.status as 404
            );
          }
          throw e;
        }
      }
    );
}
