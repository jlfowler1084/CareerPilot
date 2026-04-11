import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { primary_id, secondary_id } = body

    if (!primary_id || !secondary_id) {
      return NextResponse.json(
        { error: "primary_id and secondary_id are required" },
        { status: 400 }
      )
    }

    if (primary_id === secondary_id) {
      return NextResponse.json(
        { error: "primary_id and secondary_id must be different" },
        { status: 400 }
      )
    }

    // Verify both contacts belong to the authenticated user
    const { data: primaryContact, error: primaryError } = await supabase
      .from("contacts")
      .select("*")
      .eq("id", primary_id)
      .eq("user_id", user.id)
      .single()

    if (primaryError || !primaryContact) {
      return NextResponse.json({ error: "Primary contact not found" }, { status: 404 })
    }

    const { data: secondaryContact, error: secondaryError } = await supabase
      .from("contacts")
      .select("*")
      .eq("id", secondary_id)
      .eq("user_id", user.id)
      .single()

    if (secondaryError || !secondaryContact) {
      return NextResponse.json({ error: "Secondary contact not found" }, { status: 404 })
    }

    // Get all links for secondary contact
    const { data: secondaryLinks } = await supabase
      .from("contact_application_links")
      .select("*")
      .eq("contact_id", secondary_id)
      .eq("user_id", user.id)

    // Re-point secondary links to primary (skip duplicates)
    if (secondaryLinks && secondaryLinks.length > 0) {
      for (const link of secondaryLinks) {
        await supabase
          .from("contact_application_links")
          .upsert(
            {
              contact_id: primary_id,
              application_id: link.application_id,
              user_id: user.id,
              role: link.role,
            },
            { onConflict: "contact_id,application_id", ignoreDuplicates: true }
          )
      }
    }

    // COALESCE: fill null fields on primary from secondary
    const mergedFields: Record<string, unknown> = {}
    const coalescableFields = ["email", "phone", "company", "title", "notes", "last_contact_date"] as const
    for (const field of coalescableFields) {
      if (!primaryContact[field] && secondaryContact[field]) {
        mergedFields[field] = secondaryContact[field]
      }
    }

    let mergedContact = primaryContact

    if (Object.keys(mergedFields).length > 0) {
      const { data: updated, error: updateError } = await supabase
        .from("contacts")
        .update(mergedFields)
        .eq("id", primary_id)
        .eq("user_id", user.id)
        .select()
        .single()

      if (updateError) {
        console.error("Contact merge update error:", updateError.message)
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      mergedContact = updated
    }

    // Delete secondary contact (cascade removes its remaining links)
    const { error: deleteError } = await supabase
      .from("contacts")
      .delete()
      .eq("id", secondary_id)
      .eq("user_id", user.id)

    if (deleteError) {
      console.error("Contact merge delete error:", deleteError.message)
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ contact: mergedContact })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Contacts merge error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
