"use client";

import Image from "next/image";
import { useState } from "react";

export function AvatarImage({ src }: { src: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (failed === src) return null;
  return (
    <Image
      src={src}
      alt=""
      fill
      unoptimized
      referrerPolicy="no-referrer"
      onError={() => setFailed(src)}
      className="bg-raised object-cover"
    />
  );
}
