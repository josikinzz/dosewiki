import { defineConfig } from "drizzle-kit";

// Versioned SQL migrations are the only schema release path (dossier W2:
// PlanetScale Postgres branches never merge schema automatically).
// `generate` needs no database; `migrate` reads the direct (non-pooled) URL.
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
