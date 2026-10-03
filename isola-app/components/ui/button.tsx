import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// One white primary per screen. Everything else is outline, ghost or a link.
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0 select-none",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-neutral-200 active:bg-neutral-300",
        secondary: "bg-secondary text-secondary-foreground hover:bg-neutral-800",
        outline: "border border-input bg-transparent text-foreground hover:bg-accent hover:border-white/25",
        ghost: "text-neutral-300 hover:bg-accent hover:text-white",
        destructive: "border border-red-500/40 text-red-300 hover:bg-red-500/10",
        success: "bg-emerald-400 text-neutral-950 hover:bg-emerald-300",
        link: "text-foreground underline-offset-4 hover:underline px-0",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 px-3 text-[13px] rounded-md",
        lg: "h-12 px-5 text-base rounded-xl",
        icon: "h-10 w-10",
        "icon-sm": "h-8 w-8 rounded-md",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";
