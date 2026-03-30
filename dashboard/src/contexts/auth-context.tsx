"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { User, AuthChangeEvent, Session } from "@supabase/supabase-js"

interface AuthContextType {
  user: User | null
  loading: boolean
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true })

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    const supabase = createClient()

    supabase.auth.getUser()
      .then(({ data: { user: u } }: { data: { user: User | null } }) => {
        if (mounted) {
          setUser(u)
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        // Handle Navigator Lock steal errors from React Strict Mode gracefully
        if (mounted) {
          console.warn("Auth getUser recovered:", err instanceof Error ? err.message : err)
          setLoading(false)
        }
      })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        if (mounted) {
          setUser(session?.user ?? null)
          setLoading(false)
        }
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
