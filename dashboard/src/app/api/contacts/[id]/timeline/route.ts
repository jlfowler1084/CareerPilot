import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

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

    // Fetch contact to get email
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("id, email")
      .eq("id", id)
      .eq("user_id", user.id)
      .single()

    if (contactError || !contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 })
    }

    // Fetch emails matching contact email
    let emails: unknown[] = []
    if (contact.email) {
      const { data: emailData } = await supabase
        .from("emails")
        .select("*")
        .eq("user_id", user.id)
        .eq("from_email", contact.email)
        .order("received_at", { ascending: false })
        .limit(50)

      emails = emailData || []
    }

    // Fetch conversations linked to applications that include this contact
    // Approach: fetch all user conversations (acceptable at current volumes <500 rows)
    // then filter client-side for those involving the contact's email
    const { data: allConversations } = await supabase
      .from("conversations")
      .select("*")
      .eq("user_id", user.id)
      .order("date", { ascending: false })
      .limit(500)

    // Filter conversations that reference the contact's email in the people array
    // or are linked to applications that have this contact
    let conversations: unknown[] = []
    if (contact.email && allConversations) {
      conversations = allConversations.filter((conv: Record<string, unknown>) => {
        const people = conv.people as Array<{ email?: string }> | null
        if (!people) return false
        return people.some(
          (p) => p.email && p.email.toLowerCase() === contact.email!.toLowerCase()
        )
      }).slice(0, 50)
    }

    return NextResponse.json({ emails, conversations })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Contact timeline GET error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
