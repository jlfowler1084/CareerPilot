"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function Sheet({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/20 duration-200 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

type SheetContentProps = DialogPrimitive.Popup.Props & {
  side?: "right" | "left" | "top" | "bottom"
  showCloseButton?: boolean
}

// Per-side layout + animation classes. Animation mirrors the data-[side=*] pattern
// from dropdown-menu.tsx line 44 so both primitives stay consistent.
const SIDE_CLASSES: Record<NonNullable<SheetContentProps["side"]>, string> = {
  right:
    "top-0 bottom-0 right-0 max-w-[500px] data-[side=right]:slide-in-from-right data-[side=right]:slide-out-to-right",
  left:
    "top-0 bottom-0 left-0 max-w-[500px] data-[side=left]:slide-in-from-left data-[side=left]:slide-out-to-left",
  top:
    "top-0 left-0 right-0 max-h-[80vh] data-[side=top]:slide-in-from-top data-[side=top]:slide-out-to-top",
  bottom:
    "bottom-0 left-0 right-0 max-h-[80vh] rounded-t-xl data-[side=bottom]:slide-in-from-bottom data-[side=bottom]:slide-out-to-bottom",
}

// Base classes shared by all sides. Vertical sides keep h-full; horizontal sides keep w-full.
const BASE_HORIZONTAL = "fixed z-50 flex flex-col bg-popover text-popover-foreground ring-1 ring-foreground/10 duration-200 ease-out outline-none data-open:animate-in data-closed:animate-out"

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: SheetContentProps) {
  const isVertical = side === "right" || side === "left"
  return (
    <DialogPrimitive.Portal>
      <SheetOverlay />
      <DialogPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          BASE_HORIZONTAL,
          isVertical ? "h-full w-full" : "w-full h-auto",
          SIDE_CLASSES[side],
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="sheet-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-3 right-3"
                size="icon-sm"
              />
            }
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5 p-4 pb-0", className)}
      {...props}
    />
  )
}

function SheetTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="sheet-title"
      className={cn("font-heading text-base leading-none font-medium", className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetOverlay,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
}
