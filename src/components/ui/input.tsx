import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  const inputRef = React.useRef<HTMLInputElement>(null)

  const baseClasses = cn(
    "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
    "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
    "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
    className
  )

  const stepValue = (direction: 1 | -1) => () => {
    const el = inputRef.current
    if (!el) return
    const step = Number(el.step) || 1
    const rawValue = Number(el.value)
    const current = Number.isFinite(rawValue) ? rawValue : 0
    const min = el.min !== "" ? Number(el.min) : -Infinity
    const max = el.max !== "" ? Number(el.max) : Infinity
    const next = Math.min(max, Math.max(min, current + direction * step))
    el.value = String(next)
    el.dispatchEvent(new Event("input", { bubbles: true }))
    el.dispatchEvent(new Event("change", { bubbles: true }))
  }

  if (type === "number") {
    return (
      <div className="relative flex items-center">
        <div className="number-stepper-control absolute inset-y-1 left-1 flex w-16 items-center justify-between overflow-hidden rounded-md border border-border/70 bg-input text-foreground shadow-xs">
          <button
            type="button"
            aria-label="Decrease value"
            className="flex-1 h-full text-sm font-semibold hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
            onClick={stepValue(-1)}
          >
            -
          </button>
          <div className="w-px h-full bg-border/80" />
          <button
            type="button"
            aria-label="Increase value"
            className="flex-1 h-full text-sm font-semibold hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
            onClick={stepValue(1)}
          >
            +
          </button>
        </div>
        <input
          ref={inputRef}
          type={type}
          data-slot="input"
          className={cn(baseClasses, "pl-20")}
          {...props}
        />
      </div>
    )
  }

  return (
    <input
      type={type}
      data-slot="input"
      ref={inputRef}
      className={baseClasses}
      {...props}
    />
  )
}

export { Input }
