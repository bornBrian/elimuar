import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "mysql://elimuar:elimuar_dev@127.0.0.1:3306/elimuar",
  },
  verbose: true,
  strict: false,
});
