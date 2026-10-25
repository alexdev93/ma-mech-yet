import { AlertTriangle, Server } from "lucide-react"
import type { Metadata } from "next"
import { Suspense } from "react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getLatestPosts } from "@/server/services/post-service"
import { PageHeader } from "@/shared/components/page-header"

export const metadata: Metadata = { title: "Server Component" }

const SKELETONS = ["a", "b", "c", "d"] as const

export default function ServerExamplePage() {
  return (
    <>
      <PageHeader
        title="Server Component"
        description="Fetched and validated on the server through a cached, server-only service. No client JavaScript is shipped for this list."
      >
        <Badge variant="secondary">
          <Server /> async RSC · use cache
        </Badge>
      </PageHeader>
      <Suspense fallback={<PostsSkeleton />}>
        <Posts />
      </Suspense>
    </>
  )
}

async function Posts() {
  const posts = await getLatestPosts()

  if (!posts.ok) {
    return (
      <Card role="alert" className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2">
            <AlertTriangle className="size-4" /> Could not load posts
          </CardTitle>
          <CardDescription>{posts.error}</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <section className="grid gap-4 md:grid-cols-2">
      {posts.data.map((post) => (
        <Card key={post.id}>
          <CardHeader>
            <CardTitle className="capitalize">{post.title}</CardTitle>
            <CardDescription>Post #{post.id}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">{post.excerpt}</CardContent>
        </Card>
      ))}
    </section>
  )
}

function PostsSkeleton() {
  return (
    <div aria-busy="true" className="grid gap-4 md:grid-cols-2">
      {SKELETONS.map((key) => (
        <div key={key} className="bg-muted h-36 animate-pulse rounded-xl" />
      ))}
    </div>
  )
}
