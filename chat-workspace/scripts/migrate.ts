import { applyMigrations } from "../src/db/migrate.js";
import { createSqlClient } from "../src/db/runtime.js";

const client = await createSqlClient();

try {
  const result = await applyMigrations(client);
  console.log(`Applied migrations: ${result.applied.length ? result.applied.join(", ") : "none"}`);
  console.log(`Skipped migrations: ${result.skipped.length ? result.skipped.join(", ") : "none"}`);
  console.log("Seeded workspace data.");
} finally {
  await client.close();
}
