// ESLint enforces architecture only. Formatting and general linting belong to Biome.
import { defineConfig } from "eslint/config"
import importPlugin from "eslint-plugin-import"
import tseslint from "typescript-eslint"

const isServerSpecifier = (source) =>
  source === "server-only" ||
  source === "@/server" ||
  source.startsWith("@/server/") ||
  (source.startsWith(".") && /(^|\/)server(\/|$)/.test(source))

const noServerInClient = {
  meta: {
    type: "problem",
    messages: { forbidden: 'A "use client" module must not import server code ("{{source}}").' },
  },
  create(context) {
    const isClientModule = context.sourceCode.ast.body.some(
      (node) => node.type === "ExpressionStatement" && node.directive === "use client",
    )
    if (!isClientModule) return {}
    const check = (node) => {
      const source = node.source?.value
      if (typeof source === "string" && isServerSpecifier(source)) {
        context.report({ node, messageId: "forbidden", data: { source } })
      }
    }
    return { ImportDeclaration: check, ExportNamedDeclaration: check, ExportAllDeclaration: check }
  },
}

const browserGlobals = ["window", "document", "navigator", "localStorage", "sessionStorage"].map(
  (name) => ({ name, message: "src/shared must be environment-independent. Use src/client." }),
)

export default defineConfig(
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { parser: tseslint.parser },
    plugins: {
      import: importPlugin,
      architecture: { rules: { "no-server-in-client": noServerInClient } },
    },
    settings: {
      "import/parsers": { "@typescript-eslint/parser": [".ts", ".tsx"] },
      "import/resolver": { typescript: { project: "./tsconfig.json" } },
    },
    rules: {
      "architecture/no-server-in-client": "error",
      "import/no-cycle": ["error", { ignoreExternal: true }],
      "import/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: "./src/client",
              from: ["./src/server", "./src/app"],
              message: "src/client must not import server code or route modules.",
            },
            {
              target: "./src/shared",
              from: ["./src/server", "./src/client", "./src/app"],
              message: "src/shared may only depend on shared, components/ui and lib.",
            },
            {
              target: "./src/server",
              from: ["./src/client", "./src/app"],
              message: "src/server must not depend on client code or route modules.",
            },
            {
              target: ["./src/components", "./src/lib"],
              from: ["./src/server", "./src/client", "./src/app"],
              message: "UI primitives and lib must stay application-agnostic.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/shared/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-globals": ["error", ...browserGlobals],
      "no-restricted-imports": [
        "error",
        {
          paths: ["server-only", "client-only", "next/headers", "next/navigation"].map((name) => ({
            name,
            message: "src/shared must be environment-independent.",
          })),
        },
      ],
    },
  },
)
