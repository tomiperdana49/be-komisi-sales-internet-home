import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import { container } from "./src/container";
import routes from "./src/routes";
import { errorHandler } from "./src/middleware/error-handler.middleware";
import { securityConfig } from "./src/config/security.config";

const app = new Hono();

// Only the frontend may call the API from a browser. Without CORS_ORIGINS only local
// development origins are allowed, so a missing setting fails closed rather than open.
const DEV_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"];
const allowedOrigins = securityConfig.corsOrigins.length > 0 ? securityConfig.corsOrigins : DEV_ORIGINS;
if (securityConfig.corsOrigins.length === 0) {
  console.warn(`CORS_ORIGINS is not set — only ${DEV_ORIGINS.join(", ")} may call this API from a browser`);
}
app.use("*", cors({ origin: allowedOrigins }));
app.onError(errorHandler);

app.use("/uploads/*", serveStatic({ root: "./" }));

app.get("/", (c) => container.healthController.getHealth(c));
app.route("/api", routes);

export default app;
