import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { validateContactInput, sanitizeContactName } from "@/lib/contacts/validation"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data, error } = await supabase
      .from("contacts")
      .select("*, contact_application_links(*, application:applications(id, title, company, status))")
      .eq("id", id)
      .eq("user_id", user.id)
      .single()

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Contact not found" }, { status: 404 })
      }
      console.error("Contact fetch error:", error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ contact: data })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Contact GET error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    // If email changed, check for dedup
    if (email) {
      const { data: existing } = await supabase
        .from("contacts")
        .select("id")
        .eq("user_id", user.id)
        .eq("email", email)
        .neq("id", id)
        .maybeSingle()

      if (existing) {
        return NextResponse.json(
          { error: "Another contact with this email already exists" },
          { status: 409 }
        )
      }
    }

    const { data, error } = await supabase
      .from("contacts")
      .update({
        name,
        email,
        phone: body.phone ?? null,
        company: body.company ?? null,
        title: body.title ?? null,
        notes: body.notes ?? null,
        last_contact_date: body.last_contact_date ?? null,
      })
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single()

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Contact not found" }, { status: 404 })
      }
      console.error("Contact update error:", error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ contact: data })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Contact PUT error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { error } = await supabase
      .from("contacts")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)

    if (error) {
      console.error("Contact delete error:", error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return new NextResponse(null, { status: 204 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Contact DELETE error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
