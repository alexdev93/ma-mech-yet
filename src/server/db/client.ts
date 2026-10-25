import "server-only"
import { Pool } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-serverless"

import { getAuthEnv } from "@/server/config/env"
import * as schema from "./schema"

function createDb() {
  // WebSocket pool (built into Node 22+) so transactions are available.
  return drizzle({ client: new Pool({ connectionString: getAuthEnv().DATABASE_URL }), schema })
}

export type Db = ReturnType<typeof createDb>
/** The database or an open transaction, for queries that must also run inside one. */
export type Executor = Db | Parameters<Parameters<Db["transaction"]>[0]>[0]

let db: Db | undefined

/** Created on first use so importing this module never requires DATABASE_URL. */
export function getDb() {
  db ??= createDb()
  return db
}
