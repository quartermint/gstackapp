import { hc } from "hono/client";
import type { AppType } from "@mission-control/api";

export const client = hc<AppType>(
  import.meta.env.DEV ? "http://localhost:3000" : ""
);
