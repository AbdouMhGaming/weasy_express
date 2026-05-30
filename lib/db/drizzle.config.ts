import { defineConfig } from "drizzle-kit";

const host = process.env.DB_HOST;
const database = process.env.DB_NAME;
const user = process.env.DB_USER;
const password = process.env.DB_PASS ?? "";
const port = parseInt(process.env.DB_PORT ?? "3306", 10);

if (!host || !database || !user) {
  throw new Error("DB_HOST, DB_NAME, and DB_USER must be set.");
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  dialect: "mysql",
  dbCredentials: {
    host,
    database,
    user,
    password,
    port,
  },
});
