import { hc, type ClientResponse } from "hono/client";
import type { AppType } from "@mission-control/api";

// hc<AppType> infers the full route type graph from the API.
// The explicit type annotation avoids TS2742 ("cannot be named without a reference
// to internal API modules") by letting the consumer use the opaque client type.
type Client = ReturnType<typeof hc<AppType>>;

export const client: Client = hc<AppType>(
  ""
);
