import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: value } = await params;
  if (!["180", "192", "512"].includes(value)) return new Response(null, { status: 404 });
  const size = Number(value);
  const logo = await readFile(join(process.cwd(), "public/snow-viking-logo.png"));
  // Preserve the complete existing logo. All artwork fits inside the maskable safe circle.
  const width = Math.round(size * 0.68);
  const height = Math.round(width * 682 / 2048);
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff" }}>
      {/* Existing artwork only; no remote image or font requests. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`data:image/png;base64,${logo.toString("base64")}`} width={width} height={height} alt="SNOW VIKING" />
    </div>,
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
