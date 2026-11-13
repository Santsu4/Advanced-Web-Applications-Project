import "dotenv/config";
import { readDatabaseUrl, reportDatabaseError } from "./database/connection.js";
import { inspectDatabase } from "./database/inspect.js";

try {
  console.log(
    JSON.stringify(await inspectDatabase(readDatabaseUrl()), null, 2),
  );
} catch (error) {
  reportDatabaseError(error);
}
