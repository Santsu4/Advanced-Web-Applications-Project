import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readEnvironment } from "../src/config/environment.js";
import { createApp } from "../src/app.js";
import { startServer } from "../src/server.js";

const environment = {
  DATABASE_URL: "postgresql://test:private-password@127.0.0.1/rio_test",
  FRONTEND_URL: "http://localhost:5173",
};
const config = { ...readEnvironment(environment), port: 0 };

function fakePool(rows = []) {
  return {
    queries: [],
    endCount: 0,
    async query(sql, parameters) {
      this.queries.push({ sql, parameters });
      return { rows };
    },
    async end() {
      this.endCount += 1;
    },
  };
}

test("configuration requires a PostgreSQL database and an explicit frontend origin", () => {
  assert.deepEqual(readEnvironment(environment), {
    databaseUrl: environment.DATABASE_URL,
    frontendUrl: environment.FRONTEND_URL,
    port: 3000,
  });
  for (const databaseUrl of [
    undefined,
    "",
    "secret",
    "https://localhost/db",
    "postgresql://localhost",
  ]) {
    assert.throws(
      () => readEnvironment({ ...environment, DATABASE_URL: databaseUrl }),
      /DATABASE_URL/,
    );
  }
  for (const frontendUrl of [
    undefined,
    "",
    "null",
    "*",
    "file:///tmp",
    "https://user:secret@example.com",
    "http://localhost/path",
    "http://localhost?x=1",
  ]) {
    assert.throws(
      () => readEnvironment({ ...environment, FRONTEND_URL: frontendUrl }),
      /FRONTEND_URL/,
    );
  }
  assert.throws(
    () =>
      readEnvironment({
        DATABASE_URL: environment.DATABASE_URL,
        CLIENT_URL: environment.FRONTEND_URL,
      }),
    /FRONTEND_URL/,
  );
});

test("configuration rejects invalid ports and accepts the supported range", () => {
  for (const port of ["", "0", "-1", "65536", "3.5", "abc", "3000 "]) {
    assert.throws(
      () => readEnvironment({ ...environment, PORT: port }),
      /PORT/,
    );
  }
  assert.equal(readEnvironment({ ...environment, PORT: "65535" }).port, 65535);
});

test("importing and creating the application does not listen or query the database", () => {
  const pool = fakePool();
  assert.equal(
    typeof createApp({ pool, frontendUrl: config.frontendUrl }),
    "function",
  );
  assert.deepEqual(pool.queries, []);
  const child = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "await import('./src/app.js'); await import('./src/server.js')",
    ],
    {
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      timeout: 3000,
    },
  );
  assert.equal(child.status, 0, String(child.stderr));
  assert.equal(String(child.stdout), "");
});

test("existing GET routes retain response envelopes and parameter binding", async (t) => {
  const row = { id: 7, name: "Oulu", seat_label: 2, is_ceo_reserved: false };
  const pool = fakePool([row]);
  const { server, shutdown } = await startServer({
    config,
    pool,
    host: "127.0.0.1",
  });
  t.after(shutdown);
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const path of [
    "/api/cities",
    "/api/screens?cityId=7",
    "/api/films",
    "/api/screenings?filmId=7&cityId=7",
    "/api/prices",
    "/api/bookings?screeningId=7",
  ]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    assert.deepEqual(await response.json(), { success: true, data: [row] });
  }
  for (const resource of ["cities", "screens", "films"]) {
    const response = await fetch(`${base}/api/${resource}/7`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, data: row });
  }
  const seats = await fetch(`${base}/api/seats?screenId=7`);
  assert.deepEqual(await seats.json(), {
    success: true,
    data: [{ ...row, isBooked: false, isReservedByCeo: false }],
  });
  const missingScreen = await fetch(`${base}/api/seats`);
  assert.equal(missingScreen.status, 400);
  assert.equal((await missingScreen.json()).success, false);
  assert.ok(
    pool.queries.some(
      ({ sql, parameters }) =>
        sql.includes("screenings.film_id = $1 AND screens.city_id = $2") &&
        parameters.join() === "7,7",
    ),
  );
});

test("not-found responses remain compatible", async (t) => {
  const { server, shutdown } = await startServer({
    config,
    pool: fakePool(),
    host: "127.0.0.1",
  });
  t.after(shutdown);
  for (const path of [
    "/api/cities",
    "/api/cities/999",
    "/api/screens/999",
    "/api/films/999",
  ]) {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}${path}`,
    );
    assert.equal(response.status, 404);
    assert.equal((await response.json()).success, false);
  }
});

test("CORS uses the configured origin and malformed JSON has a safe error response", async (t) => {
  const { server, shutdown } = await startServer({
    config,
    pool: fakePool(),
    host: "127.0.0.1",
  });
  t.after(shutdown);
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/api/seats`, {
    headers: { Origin: config.frontendUrl },
  });
  assert.equal(
    response.headers.get("access-control-allow-origin"),
    config.frontendUrl,
  );
  assert.equal(
    response.headers.get("access-control-allow-credentials"),
    "true",
  );
  const otherOrigin = await fetch(`${base}/api/seats`, {
    headers: { Origin: "https://other.example" },
  });
  assert.notEqual(
    otherOrigin.headers.get("access-control-allow-origin"),
    "https://other.example",
  );
  const invalid = await fetch(`${base}/api/cities`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{private-payload",
  });
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), {
    success: false,
    error: "Invalid JSON request body",
  });
});

test("failed database startup closes the pool without listening", async () => {
  const pool = fakePool();
  pool.query = async () => {
    throw new Error("database unavailable");
  };
  await assert.rejects(startServer({ config, pool }), /database unavailable/);
  assert.equal(pool.endCount, 1);
});

test("occupied port closes the new pool and leaves the original server running", async (t) => {
  const first = await startServer({
    config,
    pool: fakePool(),
    host: "127.0.0.1",
  });
  t.after(first.shutdown);
  const pool = fakePool();
  await assert.rejects(
    startServer({
      config: { ...config, port: first.server.address().port },
      pool,
      host: "127.0.0.1",
    }),
    { code: "EADDRINUSE" },
  );
  assert.equal(pool.endCount, 1);
  assert.equal(first.server.listening, true);
});

test("shutdown is repeatable and closes both server and pool", async () => {
  const pool = fakePool();
  const { server, shutdown } = await startServer({
    config,
    pool,
    host: "127.0.0.1",
  });
  assert.equal(pool.queries[0].sql, "SELECT 1");
  await Promise.all([shutdown(), shutdown()]);
  assert.equal(server.listening, false);
  assert.equal(pool.endCount, 1);
});

test("CLI configuration errors are actionable and do not print secrets", () => {
  const child = spawnSync(process.execPath, ["server.js"], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    env: {
      ...process.env,
      DATABASE_URL: "private-password",
      FRONTEND_URL: environment.FRONTEND_URL,
      DOTENV_CONFIG_QUIET: "true",
    },
    timeout: 3000,
  });
  assert.equal(child.status, 1);
  assert.match(String(child.stderr), /DATABASE_URL must be/);
  assert.doesNotMatch(String(child.stderr), /private-password/);
});
