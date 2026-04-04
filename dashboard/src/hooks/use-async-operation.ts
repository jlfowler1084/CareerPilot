"use client"

import { useState, useRef, useCallback, useEffect } from "react"

type AsyncStatus = "idle" | "loading" | "success" | "error"

interface AsyncStateIdle {
  status: "idle"
}

interface AsyncStateLoading {
  status: "loading"
}

interface AsyncStateSuccess<T> {
  status: "success"
  data: T
}

interface AsyncStateError {
  status: "error"
  error: string
  retryCount: number
}

type AsyncState<T> = AsyncStateIdle | AsyncStateLoading | AsyncStateSuccess<T> | AsyncStateError

interface UseAsyncOperationReturn<T> {
  state: AsyncState<T>
  data: T | null
  error: string | null
  isLoading: boolean
  execute: (operation: (signal: AbortSignal) => Promise<T>) => Promise<T | null>
  reset: () => void
}

interface UseAsyncOperationOptions {
  /** Auto-reset state to idle after success/error, in milliseconds */
  resetDelay?: number
}

export function useAsyncOperation<T>(options?: UseAsyncOperationOptions): UseAsyncOperationReturn<T> {
  const [state, setState] = useState<AsyncState<T>>({ status: "idle" })
  const operationInFlight = useRef(false)
  const mountedRef = useRef(true)
  const retryCountRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Track mount status for cleanup
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      // Abort any in-flight operation on unmount
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      // Clear any pending reset timer
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current)
      }
    }
  }, [])

  const scheduleReset = useCallback(() => {
    if (options?.resetDelay && mountedRef.current) {
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current)
      }
      resetTimerRef.current = setTimeout(() => {
        if (mountedRef.current) {
          setState({ status: "idle" })
          retryCountRef.current = 0
        }
      }, options.resetDelay)
    }
  }, [options?.resetDelay])

  const execute = useCallback(async (operation: (signal: AbortSignal) => Promise<T>): Promise<T | null> => {
    // Guard: prevent re-entry while operation is in flight
    if (operationInFlight.current) {
      console.warn("[useAsyncOperation] Skipping execution — operation already in flight")
      return null
    }
    operationInFlight.current = true

    // Abort previous operation if still lingering
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    const controller = new AbortController()
    abortControllerRef.current = controller

    setState({ status: "loading" })

    try {
      const data = await operation(controller.signal)

      // Guard: don't update state if unmounted
      if (!mountedRef.current) return null

      // SUCCESS PATH — only reached if operation didn't throw
      setState({ status: "success", data })
      retryCountRef.current = 0
      scheduleReset()
      return data
    } catch (err) {
      if (!mountedRef.current) return null

      // Don't treat abort as an error
      if (err instanceof DOMException && err.name === "AbortError") {
        setState({ status: "idle" })
        return null
      }

      retryCountRef.current += 1
      setState({
        status: "error",
        error: err instanceof Error ? err.message : "Unknown error",
        retryCount: retryCountRef.current,
      })
      scheduleReset()
      return null
    } finally {
      operationInFlight.current = false
    }
  }, [scheduleReset])

  const reset = useCallback(() => {
    setState({ status: "idle" })
    retryCountRef.current = 0
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current)
    }
  }, [])

  // Derive convenience fields from state
  const data = state.status === "success" ? state.data : null
  const error = state.status === "error" ? state.error : null
  const isLoading = state.status === "loading"

  return { state, data, error, isLoading, execute, reset }
}
