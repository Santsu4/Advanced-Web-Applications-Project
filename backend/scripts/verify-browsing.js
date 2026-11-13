import "dotenv/config";
import { readDatabaseUrl } from "./database/connection.js";
import { verifyBrowsing } from "./database/verify-browsing.js";

try {
  console.log(
    JSON.stringify(
      await verifyBrowsing({
        databaseUrl: readDatabaseUrl(),
        baseUrl:
          process.env.API_BASE_URL ||
          `http://localhost:${process.env.PORT || 3000}`,
      }),
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    "Browsing verification failed. Check API_BASE_URL, database connectivity, browsing fixtures and backend TZ=Europe/Helsinki.",
  );
  process.exitCode = 1;
}
