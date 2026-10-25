import { z } from "zod"

export const contactSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(80),
  email: z.email("Enter a valid email address"),
  message: z.string().trim().min(10, "Message must be at least 10 characters").max(1000),
})

export type ContactInput = z.infer<typeof contactSchema>

export type ContactFieldErrors = Partial<Record<keyof ContactInput, string[]>>

type ContactError = { status: "error"; message: string; fieldErrors: ContactFieldErrors }

export type ContactFormState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | ContactError

export type ContactValidation = { status: "valid"; data: ContactInput } | ContactError

export function validateContact(input: unknown): ContactValidation {
  const parsed = contactSchema.safeParse(input)
  if (parsed.success) return { status: "valid", data: parsed.data }
  return {
    status: "error",
    message: "Please fix the highlighted fields.",
    fieldErrors: z.flattenError(parsed.error).fieldErrors,
  }
}
