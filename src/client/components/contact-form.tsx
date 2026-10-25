"use client"

import { Loader2, Send } from "lucide-react"
import { type FormEvent, useActionState, useState } from "react"

import { selectNotify, useAppStore } from "@/client/stores/app-store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  type ContactFieldErrors,
  type ContactFormState,
  validateContact,
} from "@/shared/schemas/contact"

type ContactAction = (state: ContactFormState, formData: FormData) => Promise<ContactFormState>

const FIELDS = [
  { name: "name", label: "Name", type: "text", autoComplete: "name" },
  { name: "email", label: "Email", type: "email", autoComplete: "email" },
] as const

export function ContactForm({ action }: { action: ContactAction }) {
  const notify = useAppStore(selectNotify)
  const [state, formAction, pending] = useActionState<ContactFormState, FormData>(
    async (previous, formData) => {
      const next = await action(previous, formData)
      if (next.status === "success") {
        notify({ title: "Message sent", description: next.message, variant: "success" })
      }
      return next
    },
    { status: "idle" },
  )
  const [clientErrors, setClientErrors] = useState<ContactFieldErrors>({})
  const errors = state.status === "error" ? { ...state.fieldErrors, ...clientErrors } : clientErrors

  // Validate in the browser for instant feedback; the Server Action validates again.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const validation = validateContact(Object.fromEntries(new FormData(event.currentTarget)))
    setClientErrors(validation.status === "error" ? validation.fieldErrors : {})
    if (validation.status === "error") event.preventDefault()
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} noValidate className="grid gap-4">
      {FIELDS.map((field) => (
        <div key={field.name} className="grid gap-2">
          <Label htmlFor={field.name}>{field.label}</Label>
          <Input
            id={field.name}
            name={field.name}
            type={field.type}
            autoComplete={field.autoComplete}
            aria-invalid={Boolean(errors[field.name])}
            aria-describedby={`${field.name}-error`}
          />
          <FieldError id={`${field.name}-error`} messages={errors[field.name]} />
        </div>
      ))}
      <div className="grid gap-2">
        <Label htmlFor="message">Message</Label>
        <textarea
          id="message"
          name="message"
          rows={4}
          aria-invalid={Boolean(errors.message)}
          aria-describedby="message-error"
          className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:ring-[3px] md:text-sm"
        />
        <FieldError id="message-error" messages={errors.message} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Send />}
          Send
        </Button>
        <output className={state.status === "error" ? "text-destructive text-sm" : "text-sm"}>
          {state.status === "idle" ? null : state.message}
        </output>
      </div>
    </form>
  )
}

function FieldError({ id, messages }: { id: string; messages: string[] | undefined }) {
  return (
    <p id={id} className="text-destructive min-h-5 text-sm">
      {messages?.[0]}
    </p>
  )
}
