import { describe, expect, it } from "vitest"

import { submitContactMessage } from "./contact-service"

describe("submitContactMessage", () => {
  it("revalidates on the server and rejects bad input", async () => {
    const result = await submitContactMessage({ name: "", email: "x", message: "" })
    expect(result.status).toBe("error")
  })

  it("accepts valid input", async () => {
    const result = await submitContactMessage({
      name: "Grace",
      email: "grace@example.com",
      message: "Server-side validation works.",
    })
    expect(result).toEqual({
      status: "success",
      message: "Thanks, Grace. Your message was received.",
    })
  })
})
