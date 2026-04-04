"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/contexts/auth-context"
import type { SkillInventoryItem } from "@/types"

const supabase = createClient()

export function useSkillsInventory() {
  const [skills, setSkills] = useState<SkillInventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const { user, loading: authLoading } = useAuth()

  useEffect(() => {
    if (authLoading) return
    if (!user) { setLoading(false); return }

    const fetchSkills = async () => {
      const { data } = await supabase
        .from("skills_inventory")
        .select("*")
        .eq("user_id", user.id)
        .order("weight", { ascending: false })

      setSkills((data || []) as unknown as SkillInventoryItem[])
      setLoading(false)
    }
    fetchSkills()
  }, [user, authLoading])

  return { skills, loading }
}
