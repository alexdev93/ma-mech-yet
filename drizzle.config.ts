import { existsSync } from "node:fs"
import { defineConfig } from "drizzle-kit"

// drizzle-kit runs outside Next, so load the same local env file Next uses.
if (existsSync(".env.local")) process.loadEnvFile(".env.local")

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
})
