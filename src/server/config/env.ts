import "server-only"
import { z } from "zod"

const serverEnvSchema = z.object({
  DEMO_API_URL: z.url().default("https://jsonplaceholder.typicode.com"),
})

const parsed = serverEnvSchema.safeParse(process.env)

if (!parsed.success) {
  throw new Error(`Invalid server environment variables:\n${z.prettifyError(parsed.error)}`)
}

export const env = parsed.data
