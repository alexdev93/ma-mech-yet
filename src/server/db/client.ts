import "server-only"
import { Pool } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-serverless"

import { getAuthEnv } from "@/server/config/env"
import * as schema from "./schema"

function createDb() {
  // WebSocket pool (built into Node 22+) so transactions are available.
  return drizzle({ client: new Pool({ connectionString: getAuthEnv().DATABASE_URL }), schema })
}

let db: ReturnType<typeof createDb> | undefined

/** Created on first use so importing this module never requires DATABASE_URL. */
export function getDb() {
  db ??= createDb()
  return db
}
