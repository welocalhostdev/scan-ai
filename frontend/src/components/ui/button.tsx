import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center border border-transparent bg-clip-padding text-sm font-bold whitespace-nowrap transition-all outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-ink-black text-canvas-cream hover:bg-ink-black/90 rounded-pill",
        outline: "border-ink-black bg-white text-ink-black hover:bg-ink-black/5 rounded-pill",
        secondary: "bg-lifted-cream text-ink-black hover:bg-ink-black/5 border-ink-black/10 rounded-pill",
        ghost: "text-ink-black hover:bg-ink-black/5 rounded-pill",
        destructive: "bg-destructive text-white hover:bg-destructive/90 rounded-pill",
        orange: "bg-signal-orange text-white hover:bg-signal-orange/90 rounded-pill",
        link: "text-ink-black underline-offset-4 hover:underline",
      },
      size: {
        default: "h-12 px-8 gap-2",
        sm: "h-9 px-4 text-xs gap-1.5",
        lg: "h-14 px-10 text-base gap-2.5",
        icon: "size-12 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
