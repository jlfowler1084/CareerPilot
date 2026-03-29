"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { SkillInventoryItem } from "@/types"

const supabase = createClient()

export function useSkillsInventory() {
  const [skills, setSkills] = useState<SkillInventoryItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchSkills = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data } = await supabase
        .from("skills_inventory")
        .select("*")
        .eq("user_id", user.id)
        .order("weight", { ascending: false })

      setSkills(data || [])
      setLoading(false)
    }
    fetchSkills()
  }, [])

  return { skills, loading }
}
