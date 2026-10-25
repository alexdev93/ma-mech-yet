// Runs once per server instance, before it handles any request.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { loadEnvVault } = await import("@/server/config/env-vault")
    await loadEnvVault()
  }
}
