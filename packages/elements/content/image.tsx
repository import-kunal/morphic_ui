"use client";

import { z } from "zod";
import { useState } from "react";
import { defineComponent } from "@/packages/engine";
import type { ComponentRendererProps } from "@/packages/engine/types";
import type { ReactNode } from "react";

function isAllowedUrl(url: unknown): url is string {
  if (typeof url !== "string" || !url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function ImageInner({ src, alt, height }: { src: string; alt: string; height?: number }): ReactNode {
  const [broken, setBroken] = useState(false);

  if (broken) {
    return (
      <div
        className="w-full rounded-md bg-zinc-800 flex items-center justify-center text-zinc-500 text-xs"
        style={{ height: Math.min(height ?? 280, 280) }}
      >
        {alt}
      </div>
    );
  }

  return (
    // Arbitrary model-provided remote URLs cannot use next/image without a
    // broad remote-pattern allowlist; protocol validation is enforced above.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className="w-full rounded-md object-cover"
      style={{
        height:    height ? `min(${height}px, 280px)` : undefined,
        maxHeight: "280px",
      }}
    />
  );
}

export const Image = defineComponent({
  name: "Image",
  description: "Displays an image from a URL. src must be http or https. For placeholder/example images always use https://picsum.photos/seed/{meaningful-seed}/{width}/{height} (e.g. https://picsum.photos/seed/albania/800/400) — never use Unsplash URLs as they require auth and will break.",
  props: z.object({
    src:    z.string(),
    alt:    z.string(),
    width:  z.number().optional(),
    height: z.number().optional(),
  }),
  component: ({ props }: ComponentRendererProps): ReactNode => {
    const src    = props["src"];
    const alt    = (props["alt"] as string | null) ?? "";
    const height = props["height"] as number | undefined;

    if (!isAllowedUrl(src)) return null;

    return <ImageInner src={src} alt={alt} height={height} />;
  },
});
