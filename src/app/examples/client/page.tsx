import type { Metadata } from "next"

import { ContactForm } from "@/client/components/contact-form"
import { Counter } from "@/client/components/counter"
import { HealthStatus } from "@/client/components/health-status"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader } from "@/shared/components/page-header"

import { submitContact } from "./actions"

export const metadata: Metadata = { title: "Client Component" }

export default function ClientExamplePage() {
  return (
    <>
      <PageHeader
        title="Client Component"
        description="This page is a Server Component. Only the interactive islands below ship JavaScript."
      >
        <Badge variant="secondary">&quot;use client&quot; islands</Badge>
      </PageHeader>
      <Card>
        <CardHeader>
          <CardTitle>Counter</CardTitle>
          <CardDescription>Local state with useState.</CardDescription>
        </CardHeader>
        <CardContent>
          <Counter />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Contact form</CardTitle>
          <CardDescription>
            One Zod schema validates in the browser and again inside the Server Action.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ContactForm action={submitContact} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Route Handler</CardTitle>
          <CardDescription>
            A browser service calls /api/health and validates the response.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HealthStatus />
        </CardContent>
      </Card>
    </>
  )
}
