import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { startServer } from "../src/server.js";

const databaseUrl = process.env.TEST_DATABASE_URL;

test(
  "real PostgreSQL connection, HTTP request and pool shutdown",
  { skip: !databaseUrl },
  async (t) => {
    const pool = new pg.Pool({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 5000,
    });
    const { server, shutdown } = await startServer({
      config: { databaseUrl, frontendUrl: "http://localhost:5173", port: 0 },
      pool,
      host: "127.0.0.1",
    });
    t.after(shutdown);
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/seats`,
    );
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      success: false,
      error: "screenId query parameter required",
    });
    await shutdown();
    assert.equal(server.listening, false);
    assert.equal(pool.totalCount, 0);
  },
);

test(
  "real CLI startup and SIGTERM exit cleanly",
  { skip: !databaseUrl, timeout: 15000 },
  async (t) => {
    // Reserve a temporary port, then release it before starting the CLI process.
    const { createServer } = await import("node:net");
    const reservation = createServer().listen(0, "127.0.0.1");
    await once(reservation, "listening");
    const port = reservation.address().port;
    await new Promise((resolve) => reservation.close(resolve));
    const child = spawn(process.execPath, ["server.js"], {
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        FRONTEND_URL: "http://localhost:5173",
        PORT: String(port),
        DOTENV_CONFIG_QUIET: "true",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    t.after(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    });
    const exit = once(child, "exit");
    let output = "";
    const started = new Promise((resolve, reject) => {
      child.stdout.on("data", (chunk) => {
        output += chunk.toString();
        if (output.includes(`Server listening on port ${port}`)) resolve();
      });
      child.once("error", reject);
      child.once("exit", () =>
        reject(new Error("CLI exited before listening")),
      );
    });
    await started;
    const response = await fetch(`http://127.0.0.1:${port}/api/seats`);
    assert.equal(response.status, 400);
    child.kill("SIGTERM");
    const [code, signal] = await exit;
    assert.equal(code, 0);
    assert.equal(signal, null);
  },
);
