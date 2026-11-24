// Legacy dynamic icon URLs reuse the already approved static artwork on Workers.
export async function GET(request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  if (!["180", "192", "512"].includes(size)) return new Response(null, { status: 404 });
  return Response.redirect(new URL(`/icons/snow-viking-${size}-v2.png`, request.url), 307);
}
