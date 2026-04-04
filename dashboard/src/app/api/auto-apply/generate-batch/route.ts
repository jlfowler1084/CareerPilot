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

interface BatchResult {
  id: string
  status: "success" | "error"
  resumeUrl?: string
  coverLetterUrl?: string
  error?: string
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { queueIds } = await req.json() as { queueIds: string[] }
    if (!queueIds || !Array.isArray(queueIds) || queueIds.length === 0) {
      return NextResponse.json({ error: "queueIds array required" }, { status: 400 })
    }

    // Cap batch size to prevent timeout
    const ids = queueIds.slice(0, 10)
    const results: BatchResult[] = []

    // Extract cookies once for internal API calls
    const cookies = req.headers.get("cookie")
    if (!cookies) {
      console.warn("Cookie header missing for internal API calls in generate-batch")
    }

    for (const id of ids) {
      try {
        // Load queue item
        const { data: item, error: loadError } = await supabase
          .from("auto_apply_queue")
          .select("*")
          .eq("id", id)
          .eq("user_id", user.id)
          .maybeSingle()

        if (loadError || !item) {
          results.push({ id, status: "error", error: "Queue item not found" })
          continue
        }

        // Set status to generating
        await supabase
          .from("auto_apply_queue")
          .update({ status: "generating", updated_at: new Date().toISOString() })
          .eq("id", id)

        const { data: profile } = await supabase
          .from("profiles" as any)
          .select("full_name")
          .eq("id", user.id)
          .maybeSingle()
        const pdfMeta = { name: (profile as any)?.full_name ?? "User", title: item.job_title, company: item.company }
        const company = sanitizeFilename(item.company)
        const title = sanitizeFilename(item.job_title)
        const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "")

        let resumeUrl: string | undefined
        let coverLetterUrl: string | undefined

        // Generate resume PDF
        // First check if there's a linked application with tailored resume text
        let resumeText: string | null = null
        if (item.application_id) {
          const { data: app } = await supabase
            .from("applications")
            .select("tailored_resume")
            .eq("id", item.application_id)
            .maybeSingle()
          resumeText = app?.tailored_resume || null
        }

        if (!resumeText) {
          // Call the existing tailor-resume API to generate one
          const tailorResp = await fetch(new URL("/api/tailor-resume", req.url), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(cookies ? { cookie: cookies } : {}),
            },
            body: JSON.stringify({
              title: item.job_title,
              company: item.company,
              url: item.job_url,
            }),
          })

          if (tailorResp.ok) {
            const tailorData = await tailorResp.json()
            resumeText = tailorData.tailoredResume || null
          } else {
            console.error(`Internal tailor-resume call failed with status ${tailorResp.status} for queue item ${id}`)
          }
        }

        if (resumeText) {
          const resumeBuffer = await generateResumePdf(resumeText, pdfMeta)
          const resumePath = `${user.id}/${company}_${title}_${timestamp}.pdf`

          const { error: uploadErr } = await supabase.storage
            .from("resumes")
            .upload(resumePath, resumeBuffer, { contentType: "application/pdf", upsert: true })

          if (!uploadErr) {
            const { data: signed } = await supabase.storage
              .from("resumes")
              .createSignedUrl(resumePath, 3600)
            resumeUrl = signed?.signedUrl
          }
        }

        // Generate cover letter PDF
        let coverLetterText: string | null = null
        if (item.application_id) {
          const { data: app } = await supabase
            .from("applications")
            .select("cover_letter")
            .eq("id", item.application_id)
            .maybeSingle()
          coverLetterText = app?.cover_letter || null
        }

        if (!coverLetterText) {
          // Call existing cover letter API
          const clResp = await fetch(new URL("/api/cover-letter", req.url), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(cookies ? { cookie: cookies } : {}),
            },
            body: JSON.stringify({
              title: item.job_title,
              company: item.company,
              url: item.job_url,
            }),
          })

          if (clResp.ok) {
            const clData = await clResp.json()
            coverLetterText = clData.coverLetter || null
          } else {
            console.error(`Internal cover-letter call failed with status ${clResp.status} for queue item ${id}`)
          }
        }

        if (coverLetterText) {
          const clBuffer = await generateCoverLetterPdf(coverLetterText, pdfMeta)
          const clPath = `${user.id}/${company}_${title}_${timestamp}.pdf`

          const { error: uploadErr } = await supabase.storage
            .from("cover-letters")
            .upload(clPath, clBuffer, { contentType: "application/pdf", upsert: true })

          if (!uploadErr) {
            const { data: signed } = await supabase.storage
              .from("cover-letters")
              .createSignedUrl(clPath, 3600)
            coverLetterUrl = signed?.signedUrl
          }
        }

        // Update queue item with URLs and status
        await supabase
          .from("auto_apply_queue")
          .update({
            tailored_resume_url: resumeUrl || null,
            cover_letter_url: coverLetterUrl || null,
            status: "ready",
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)

        results.push({ id, status: "success", resumeUrl, coverLetterUrl })
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Unknown error"
        // Mark as failed
        await supabase
          .from("auto_apply_queue")
          .update({
            status: "failed",
            error_message: errMsg,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)

        results.push({ id, status: "error", error: errMsg })
      }
    }

    return NextResponse.json({ results })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
