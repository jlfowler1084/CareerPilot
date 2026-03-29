import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { generateResumePdf, generateCoverLetterPdf } from "@/lib/pdf-generator"

function sanitizeFilename(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 50)
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { type, text, metadata } = body as {
      type: "resume" | "cover_letter"
      text: string
      metadata: { title: string; company: string }
    }

    if (!type || !text || !metadata?.title || !metadata?.company) {
      return NextResponse.json({ error: "Missing required fields: type, text, metadata.title, metadata.company" }, { status: 400 })
    }

    // Generate PDF buffer
    const pdfMetadata = { name: "Joseph Fowler", title: metadata.title, company: metadata.company }
    const pdfBuffer = type === "resume"
      ? await generateResumePdf(text, pdfMetadata)
      : await generateCoverLetterPdf(text, pdfMetadata)

    // Build storage path
    const bucket = type === "resume" ? "resumes" : "cover-letters"
    const company = sanitizeFilename(metadata.company)
    const title = sanitizeFilename(metadata.title)
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "")
    const filename = `${company}_${title}_${timestamp}.pdf`
    const storagePath = `${user.id}/${filename}`

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(storagePath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      })

    if (uploadError) {
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 })
    }

    // Generate signed URL (1 hour expiry)
    const { data: signedData, error: signError } = await supabase.storage
      .from(bucket)
      .createSignedUrl(storagePath, 3600)

    if (signError || !signedData?.signedUrl) {
      return NextResponse.json({ error: "Failed to generate download URL" }, { status: 500 })
    }

    return NextResponse.json({
      url: signedData.signedUrl,
      path: `${bucket}/${storagePath}`,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
