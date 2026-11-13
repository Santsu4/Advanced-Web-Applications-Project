import "dotenv/config";
import { readDatabaseUrl, reportDatabaseError } from "./database/connection.js";
import { seedBrowsing } from "./database/seed-browsing.js";

try {
  const result = await seedBrowsing({
    databaseUrl: readDatabaseUrl(),
    mode: process.env.RIO_DATABASE_MODE,
  });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  reportDatabaseError(error);
}
