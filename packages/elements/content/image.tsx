"use client";

import { z } from "zod";
import { useState } from "react";
import { defineComponent } from "@/packages/engine";
import type { ComponentRendererProps } from "@/packages/engine/types";
import type { ReactNode } from "react";

const ALLOWED_IMAGE_HOSTS = new Set(["picsum.photos", "fastly.picsum.photos"]);

function isAllowedUrl(url: unknown): url is string {
  if (typeof url !== "string" || !url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && ALLOWED_IMAGE_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

function ImageInner({ src, alt, width, height }: { src: string; alt: string; width?: number; height?: number }): ReactNode {
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
      width={width}
      height={height}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className="w-full rounded-md object-cover"
      style={{
        width:     width ? `min(${width}px, 100%)` : "100%",
        height:    height ? `min(${height}px, 280px)` : undefined,
        maxHeight: "280px",
      }}
    />
  );
}

export const Image = defineComponent({
  name: "Image",
  description: "Displays an allow-listed HTTPS image. Use https://picsum.photos/seed/{meaningful-seed}/{width}/{height}; other remote hosts are blocked.",
  props: z.object({
    src:    z.string(),
    alt:    z.string(),
    width:  z.number().optional(),
    height: z.number().optional(),
  }),
  component: ({ props }: ComponentRendererProps): ReactNode => {
    const src    = props["src"];
    const alt    = (props["alt"] as string | null) ?? "";
    const width  = props["width"] as number | undefined;
    const height = props["height"] as number | undefined;

    if (!isAllowedUrl(src)) return null;

    return <ImageInner src={src} alt={alt} width={width} height={height} />;
  },
});
