"use client"

interface PipelineResult {
  generated: string[]
  ready: string[]
  failed: string[]
  dailyLimitHit: boolean
}

export async function runPipeline(
  queueIds: string[],
  options: {
    generateMaterials: boolean
    maxBatch: number
  }
): Promise<PipelineResult> {
  const result: PipelineResult = {
    generated: [],
    ready: [],
    failed: [],
    dailyLimitHit: false,
  }

  // Check daily limit first
  try {
    const statsResp = await fetch("/api/auto-apply/stats")
    if (statsResp.ok) {
      const stats = await statsResp.json()
      if (stats.dailyLimit.used >= stats.dailyLimit.max) {
        result.dailyLimitHit = true
        return result
      }

      // Cap the batch to remaining daily capacity
      const remaining = stats.dailyLimit.max - stats.dailyLimit.used
      if (queueIds.length > remaining) {
        queueIds = queueIds.slice(0, remaining)
      }
    }
  } catch {
    // Continue if stats check fails
  }

  // Batch the IDs according to maxBatch
  const batches: string[][] = []
  for (let i = 0; i < queueIds.length; i += options.maxBatch) {
    batches.push(queueIds.slice(i, i + options.maxBatch))
  }

  for (const batch of batches) {
    if (options.generateMaterials) {
      try {
        const resp = await fetch("/api/auto-apply/generate-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ queueIds: batch }),
        })

        if (resp.ok) {
          const data = await resp.json()
          for (const r of data.results || []) {
            if (r.status === "success") {
              result.generated.push(r.id)
              result.ready.push(r.id)
            } else {
              result.failed.push(r.id)
            }
          }
        } else {
          result.failed.push(...batch)
        }
      } catch {
        result.failed.push(...batch)
      }
    } else {
      // Items already have materials, just mark as ready
      result.ready.push(...batch)
    }
  }

  return result
}
