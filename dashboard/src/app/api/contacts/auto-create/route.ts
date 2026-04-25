import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { validateContactEmail, sanitizeContactName, normalizeContactEmail } from "@/lib/contacts/validation"
import { shouldAutoCreateContact } from "@/lib/contacts/auto-create-gate"

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { from_email, from_name, from_domain, company, role, application_id } = body

    // CAR-141: Gate check — rejects no-reply addresses, blocked domains, un-replied threads, and self-sends
    const gate = shouldAutoCreateContact(
      { from_email: from_email ?? null, from_name: body.from_name ?? null, replied_at: body.replied_at ?? null },
      user.email ?? ""
    )
    if (!gate.allow) {
      console.info(`[auto-create] skipped: ${gate.reason}`)
      return NextResponse.json({ contact: null, created: false, skipped: gate.reason })
    }

    // Validate email — if invalid, return gracefully (fire-and-forget)
    if (!from_email || !validateContactEmail(from_email)) {
      return NextResponse.json({ contact: null, created: false })
    }

    // normalizeContactEmail returns null only for null/empty input; from_email is validated non-empty above
    const normalizedEmail = normalizeContactEmail(from_email) as string

    const name = from_name ? sanitizeContactName(from_name) : from_email

    // Check if contact already exists
    const { data: existing } = await supabase
      .from("contacts")
      .select("*")
      .eq("user_id", user.id)
      .eq("email", normalizedEmail)
      .maybeSingle()

    let contact = existing
    let created = false

    if (!contact) {
      // Create new contact
      const { data: newContact, error: createError } = await supabase
        .from("contacts")
        .insert({
          user_id: user.id,
          name,
          email: normalizedEmail,
          company: company || from_domain || null,
          source: "recruiter_email",
          last_contact_date: new Date().toISOString(),
        })
        .select()
        .single()

      if (createError) {
        console.error("Auto-create contact error:", createError.message)
        return NextResponse.json({ contact: null, created: false })
      }

      contact = newContact
      created = true
    } else {
      // Update last_contact_date on existing contact
      await supabase
        .from("contacts")
        .update({ last_contact_date: new Date().toISOString() })
        .eq("id", contact.id)
        .eq("user_id", user.id)

      contact = { ...contact, last_contact_date: new Date().toISOString() }
    }

    // Link to application if provided
    if (application_id && contact) {
      await supabase
        .from("contact_application_links")
        .upsert(
          {
            contact_id: contact.id,
            application_id,
            user_id: user.id,
            role: role || "recruiter",
          },
          { onConflict: "contact_id,application_id", ignoreDuplicates: true }
        )
    }

    return NextResponse.json({ contact, created })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Contacts auto-create error:", message)
    return NextResponse.json({ contact: null, created: false })
  }
}
