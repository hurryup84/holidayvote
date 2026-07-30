"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: React.HTMLAttributes<HTMLHRElement> & {
  orientation?: "horizontal" | "vertical";
  decorative?: boolean;
}) {
  return (
    <hr
      aria-orientation={orientation}
      aria-hidden={decorative}
      className={cn(
        "shrink-0 bg-slate-200 border-0",
        orientation === "horizontal" ? "h-[1px] w-full" : "h-full w-[1px]",
        className
      )}
      {...props}
    />
  );
}