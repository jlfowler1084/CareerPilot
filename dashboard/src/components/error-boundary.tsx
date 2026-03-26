"use client"

import { Component, type ReactNode } from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error) {
    console.error("Component error:", error)
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="bg-white rounded-xl border border-zinc-200 p-8 text-center">
            <div className="mx-auto w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center mb-4">
              <AlertTriangle size={24} className="text-red-400" />
            </div>
            <h3 className="text-sm font-semibold text-zinc-800 mb-1">
              Something went wrong
            </h3>
            <p className="text-xs text-zinc-500 mb-4">
              This section encountered an error.
            </p>
            <button
              onClick={() => this.setState({ hasError: false })}
              className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-lg bg-zinc-100 text-zinc-700 hover:bg-zinc-200 transition-colors"
            >
              <RefreshCw size={12} />
              Try again
            </button>
          </div>
        )
      )
    }
    return this.props.children
  }
}
