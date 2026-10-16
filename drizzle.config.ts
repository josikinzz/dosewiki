import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: ["./lib/postgres/schema.generated.ts", "./lib/postgres/schema.runtime.ts"],
  out: "./lib/postgres/migrations",
  dbCredentials: {
    url: process.env.POSTGRES_DIRECT_URL ?? "postgres://localhost:5432/dosewiki",
  },
  strict: true,
  verbose: true,
});
