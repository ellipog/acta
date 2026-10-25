import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap border font-medium select-none transition-colors active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0 [&_svg:not(.pixel)]:size-4",
  {
    variants: {
      variant: {
        primary: "border-lapis bg-lapis text-on-accent hover:border-lapis-hover hover:bg-lapis-hover",
        secondary: "border-line-strong bg-raised text-ink hover:bg-sunken",
        ghost: "border-transparent bg-transparent text-ink-2 hover:bg-sunken hover:text-ink",
        pyrite: "border-pyrite bg-pyrite-soft text-pyrite-ink hover:bg-pyrite hover:text-on-accent",
        danger: "border-hematite bg-hematite text-on-accent hover:opacity-90",
      },
      size: {
        sm: "h-7 px-2.5 text-xs",
        md: "h-9 px-3.5 text-sm",
        lg: "h-11 px-5 text-base",
        icon: "size-9",
        "icon-sm": "size-7",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
