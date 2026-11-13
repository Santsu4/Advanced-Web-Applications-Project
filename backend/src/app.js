import express from "express";
import cors from "cors";
import registerApiRoutes from "../api.js";

export function createApp({ pool, frontendUrl }) {
  const app = express();
  app.use(cors({ origin: frontendUrl, credentials: true }));
  app.use(express.json());
  registerApiRoutes(app, pool);
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status =
      error.type === "entity.parse.failed"
        ? 400
        : error.type === "entity.too.large"
          ? 413
          : 500;
    res.status(status).json({
      success: false,
      error:
        status === 400
          ? "Invalid JSON request body"
          : status === 413
            ? "Request body too large"
            : "Internal server error",
    });
  });
  return app;
}
