"use client"

import dynamic from "next/dynamic"
import type { Application, ApplicationEvent } from "@/types"

const OverviewContent = dynamic(() => import("./overview-content"), {
  ssr: false,
})

interface Props {
  initialApplications: Application[] | null
  initialEvents: ApplicationEvent[] | null
  initialNewMatchCount: number
}

export default function OverviewClient(props: Props) {
  return <OverviewContent {...props} />
}
