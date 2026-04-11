import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { validateContactInput, sanitizeContactName } from "@/lib/contacts/validation"

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const search = searchParams.get("search")
    const role = searchParams.get("role")
    const recency = searchParams.get("recency")

    let query = supabase
      .from("contacts")
      .select("*, contact_application_links(count)")
      .eq("user_id", user.id)
      .order("last_contact_date", { ascending: false, nullsFirst: false })

    if (search) {
      query = query.or(`name.ilike.%${search}%,company.ilike.%${search}%,email.ilike.%${search}%`)
    }

    // Recency filter on last_contact_date
    if (recency) {
      const now = new Date()
      if (recency === "active") {
        const cutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString()
        query = query.gte("last_contact_date", cutoff)
      } else if (recency === "recent") {
        const from = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString()
        const to = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString()
        query = query.gte("last_contact_date", from).lte("last_contact_date", to)
      } else if (recency === "dormant") {
        const from = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString()
        const to = new Date(now.getTime() - 61 * 24 * 60 * 60 * 1000).toISOString()
        query = query.gte("last_contact_date", from).lte("last_contact_date", to)
      } else if (recency === "inactive") {
        const cutoff = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString()
        query = query.lte("last_contact_date", cutoff)
      }
    }

    const { data, error } = await query

    if (error) {
      console.error("Contacts fetch error:", error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // If filtering by role, fetch contact IDs from join table then filter
    let contacts = data || []
    if (role) {
      const { data: linkData, error: linkError } = await supabase
        .from("contact_application_links")
        .select("contact_id")
        .eq("user_id", user.id)
        .eq("role", role)

      if (linkError) {
        console.error("Contacts role filter error:", linkError.message)
        return NextResponse.json({ error: linkError.message }, { status: 500 })
      }

      const contactIds = new Set((linkData || []).map((l: { contact_id: string }) => l.contact_id))
      contacts = contacts.filter((c: { id: string }) => contactIds.has(c.id))
    }

    // Flatten link_count from nested aggregate
    const normalized = contacts.map((c: Record<string, unknown>) => {
      const linkArr = c.contact_application_links as Array<{ count: number }> | null
      return {
        ...c,
        contact_application_links: undefined,
        link_count: linkArr?.[0]?.count ?? 0,
      }
    })

    return NextResponse.json({ contacts: normalized })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Contacts GET error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()

    const validation = validateContactInput({ name: body.name, email: body.email })
    if (!validation.valid) {
      return NextResponse.json({ error: validation.errors.join(", ") }, { status: 400 })
    }

    const name = sanitizeContactName(body.name)
    const email: string | null = body.email || null

    // Dedup check: same user + same email
    if (email) {
      const { data: existing } = await supabase
        .from("contacts")
        .select("id, name, email")
        .eq("user_id", user.id)
        .eq("email", email)
        .maybeSingle()

      if (existing) {
        return NextResponse.json(
          { error: "A contact with this email already exists", contact: existing },
          { status: 409 }
        )
      }
    }

    const { data, error } = await supabase
      .from("contacts")
      .insert({
        user_id: user.id,
        name,
        email,
        phone: body.phone || null,
        company: body.company || null,
        title: body.title || null,
        source: "manual",
        notes: body.notes || null,
        last_contact_date: body.last_contact_date || null,
      })
      .select()
      .single()

    if (error) {
      console.error("Contact create error:", error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ contact: data }, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Contacts POST error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
