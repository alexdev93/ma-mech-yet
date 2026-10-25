"use client"

import type { ReactNode } from "react"

import { Toaster } from "@/client/components/toaster"
import { AppStoreProvider } from "@/client/stores/app-store"

import { ThemeProvider } from "./theme-provider"

/** Every client-side provider in one place. Add new providers here, not in the layout. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <AppStoreProvider>
        {children}
        <Toaster />
      </AppStoreProvider>
    </ThemeProvider>
  )
}
