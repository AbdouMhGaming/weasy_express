import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

const host = process.env.DB_HOST;
const database = process.env.DB_NAME;
const user = process.env.DB_USER;
const password = process.env.DB_PASS;
const port = parseInt(process.env.DB_PORT ?? "3306", 10);

if (!host || !database || !user) {
  throw new Error(
    "DB_HOST, DB_NAME, and DB_USER must be set. Check your environment secrets.",
  );
}

export const pool = mysql.createPool({
  host,
  database,
  user,
  password: password ?? "",
  port,
  waitForConnections: true,
  connectionLimit: 10,
  enableKeepAlive: true,
});

export const db = drizzle(pool, { schema, mode: "default" });
export * from "./schema";
export { eq, ne, and, or, desc, asc, sql, count, isNull, isNotNull } from "drizzle-orm";
