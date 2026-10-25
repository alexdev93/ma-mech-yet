import { describe, expect, it } from "vitest"

import { validateContact } from "./contact"

const valid = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  message: "Hello from the test suite.",
}

describe("validateContact", () => {
  it("accepts valid input and trims strings", () => {
    expect(validateContact({ ...valid, name: "  Ada Lovelace  " })).toEqual({
      status: "valid",
      data: valid,
    })
  })

  it("returns field errors for invalid input", () => {
    const result = validateContact({ name: "A", email: "nope", message: "short" })
    expect(result.status).toBe("error")
    if (result.status !== "error") return
    expect(Object.keys(result.fieldErrors).sort()).toEqual(["email", "message", "name"])
  })

  it("rejects untrusted non-object input", () => {
    expect(validateContact(42).status).toBe("error")
    expect(validateContact(null).status).toBe("error")
  })
})
