import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id } = await params;

  if (!id) {
    return Response.json({ success: false, error: "Document id is required." }, { status: 400 });
  }

  try {
    const result = await query<{ id: string }>(
      `DELETE FROM documents
       WHERE id = $1
       RETURNING id`,
      [id],
    );

    if (result.rowCount === 0) {
      return Response.json({ success: false, error: "Document not found." }, { status: 404 });
    }

    return Response.json({ success: true, id }, { status: 200 });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to delete the document.",
      },
      { status: 500 },
    );
  }
}