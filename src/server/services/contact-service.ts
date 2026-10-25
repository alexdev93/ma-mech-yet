import "server-only"

import { type ContactFormState, validateContact } from "@/shared/schemas/contact"

export async function submitContactMessage(input: unknown): Promise<ContactFormState> {
  const validation = validateContact(input)
  if (validation.status !== "valid") return validation

  // Persist or forward the message here (database, email provider, queue, ...).
  return {
    status: "success",
    message: `Thanks, ${validation.data.name}. Your message was received.`,
  }
}
