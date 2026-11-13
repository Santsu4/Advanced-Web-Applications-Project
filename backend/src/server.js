import { createApp } from "./app.js";
import { createDatabasePool } from "./config/database.js";

export async function startServer({
  config,
  pool = createDatabasePool(config),
  host,
}) {
  let server;
  try {
    await pool.query("SELECT 1");
    const app = createApp({ pool, frontendUrl: config.frontendUrl });
    server = await new Promise((resolve, reject) => {
      const listener = app.listen(config.port, host);
      listener.once("error", reject);
      listener.once("listening", () => {
        listener.removeListener("error", reject);
        resolve(listener);
      });
    });
  } catch (error) {
    await pool.end();
    throw error;
  }

  let shutdownPromise;
  function shutdown() {
    shutdownPromise ??= (async () => {
      const forceClose = setTimeout(() => server.closeAllConnections(), 10000);
      forceClose.unref();
      try {
        await new Promise((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        });
      } finally {
        clearTimeout(forceClose);
        await pool.end();
      }
    })();
    return shutdownPromise;
  }

  return { server, shutdown };
}
