import "server-only"
import { cacheLife, cacheTag } from "next/cache"

import { fetchDemoPosts } from "@/server/integrations/demo-api"
import type { Result } from "@/shared/types/result"

export type PostSummary = {
  id: number
  title: string
  excerpt: string
}

export const POSTS_CACHE_TAG = "demo-posts"

const EXCERPT_LENGTH = 120

export async function getLatestPosts(limit = 6): Promise<Result<PostSummary[]>> {
  "use cache"
  cacheTag(POSTS_CACHE_TAG)

  const result = await fetchDemoPosts(limit)
  if (!result.ok) {
    // Short-lived entries are excluded from the static shell, so a failure is retried soon.
    cacheLife("seconds")
    return result
  }

  cacheLife("minutes")
  return {
    ok: true,
    data: result.data.map(({ id, title, body }) => ({
      id,
      title,
      excerpt: body.length > EXCERPT_LENGTH ? `${body.slice(0, EXCERPT_LENGTH)}…` : body,
    })),
  }
}
