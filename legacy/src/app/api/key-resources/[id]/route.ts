import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getById, updatePrompt, deleteResource } from "@/lib/services/key-resource-service";

type Params = { params: Promise<{ id: string }> };

/** GET /api/key-resources/:id — detail with all versions */
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  try {
    const detail = await getById(id);
    if (!detail) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

const PatchSchema = z.object({
  prompt: z.string().min(1),
});

/** PATCH /api/key-resources/:id — update prompt (no regeneration) */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  try {
    const result = await updatePrompt(id, parsed.data.prompt);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** DELETE /api/key-resources/:id */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    await deleteResource(id);
    return NextResponse.json({ deleted: id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
