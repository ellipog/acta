"use client";

import { Dialog as D } from "radix-ui";
import { DialogContent } from "@/components/ui/dialog";
import { Markdown } from "@/components/ui/markdown";

// An item opened from the public roadmap, with its description. The page builds what goes around the description,
// and this arrives with the dialog code the first time a visitor opens one
export function RoadmapDetail({
  title,
  description,
  top,
  bottom,
  style,
  onClose,
}: {
  title: string;
  description: string;
  top: React.ReactNode;
  bottom: React.ReactNode;
  style?: React.CSSProperties;
  onClose: () => void;
}) {
  return (
    <D.Root open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={title} className="max-w-xl">
        <div className="flex flex-col gap-4" style={style}>
          {top}
          {description ? <Markdown source={description} /> : <p className="text-sm text-ink-3">No details yet.</p>}
          {bottom}
        </div>
      </DialogContent>
    </D.Root>
  );
}
