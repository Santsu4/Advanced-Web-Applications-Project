import "dotenv/config";
import { readEnvironment } from "./src/config/environment.js";
import { startServer } from "./src/server.js";

let isConfigured = false;
try {
  const config = readEnvironment();
  isConfigured = true;
  const { server, shutdown } = await startServer({ config });
  console.log(`Server listening on port ${server.address().port}`);

  let isStopping = false;
  const stop = () => {
    if (isStopping) return;
    isStopping = true;
    shutdown().catch(() => {
      console.error("Server shutdown failed");
      process.exitCode = 1;
    });
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
} catch (error) {
  // Configuration errors are controlled messages; database errors may contain secrets.
  console.error(
    isConfigured
      ? "Backend startup failed. Check database connectivity and whether PORT is available."
      : error.message,
  );
  process.exitCode = 1;
}
