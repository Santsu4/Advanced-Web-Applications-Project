import "dotenv/config";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  readDatabaseUrl,
  assertIsolatedDevelopment,
  reportDatabaseError,
} from "./database/connection.js";

try {
  const databaseUrl = readDatabaseUrl();
  assertIsolatedDevelopment(databaseUrl, process.env.RIO_DATABASE_MODE);
  const child = spawn(process.execPath, ["--test"], {
    stdio: "inherit",
    env: {
      ...process.env,
      TZ: "Europe/Helsinki",
      TEST_DATABASE_URL: databaseUrl,
      TEST_MIGRATION_DATABASE_URL: databaseUrl,
      TEST_BROWSING_DATABASE_URL: databaseUrl,
      TEST_SCREENINGS_DATABASE_URL: databaseUrl,
    },
  });
  const [code] = await once(child, "exit");
  process.exitCode = code ?? 1;
} catch (error) {
  reportDatabaseError(error);
}
