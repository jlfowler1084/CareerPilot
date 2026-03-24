"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push("/")
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
      <div className="bg-white rounded-xl border border-zinc-200 p-8 w-full max-w-sm shadow-sm">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-10 h-10 rounded-lg bg-amber-500 flex items-center justify-center font-bold text-lg text-zinc-900">
            CP
          </div>
          <div>
            <div className="font-bold text-lg">Career Pilot</div>
            <div className="text-xs text-zinc-500 font-mono">v2.0</div>
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-zinc-600 block mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full text-sm border border-zinc-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
              required
            />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-600 block mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full text-sm border border-zinc-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
              required
            />
          </div>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-md bg-amber-500 text-white font-semibold text-sm hover:bg-amber-600 disabled:opacity-50 transition-colors"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  )
}
