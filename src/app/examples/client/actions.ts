"use server"

import { submitContactMessage } from "@/server/services/contact-service"
import type { ContactFormState } from "@/shared/schemas/contact"

export async function submitContact(
  _previous: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  return submitContactMessage(Object.fromEntries(formData))
}
