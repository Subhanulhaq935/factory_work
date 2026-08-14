import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Product from "@/lib/models/Product";
import type { SyncQueueItem } from "@/lib/offlineDB";

/**
 * POST /api/sync
 * Accepts an array of offline sync operations and applies them idempotently.
 * Each operation carries a `clientTransactionId` to prevent duplicates.
 */
export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const body = await req.json();
    const operations: SyncQueueItem[] = body?.operations ?? [];

    if (!Array.isArray(operations) || operations.length === 0) {
      return NextResponse.json({ results: [] }, { status: 200 });
    }

    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const op of operations) {
      try {
        if (op.entity !== "product") {
          results.push({ id: op.id, success: false, error: "Unknown entity" });
          continue;
        }

        switch (op.type) {
          // ── Create ──────────────────────────────────────────────────────
          case "create": {
            // Idempotent: if a product with this id already exists, skip creation
            const exists = await Product.exists({ id: op.productId });
            if (!exists) {
              await Product.create({
                id:        op.productId,
                name:      String(op.payload.name ?? "").trim(),
                nameUrdu:  String(op.payload.nameUrdu ?? "").trim(),
                price:     Number(op.payload.price ?? 0),
                category:  String(op.payload.category ?? ""),
                code:      op.payload.code ? String(op.payload.code).trim() : undefined,
              });
            }
            results.push({ id: op.id, success: true });
            break;
          }

          // ── Update ──────────────────────────────────────────────────────
          case "update": {
            const updateFields: Record<string, unknown> = {};

            if (op.payload.name      !== undefined) updateFields.name      = String(op.payload.name).trim();
            if (op.payload.nameUrdu  !== undefined) updateFields.nameUrdu  = String(op.payload.nameUrdu).trim();
            if (op.payload.price     !== undefined) updateFields.price     = Number(op.payload.price);
            if (op.payload.category  !== undefined) updateFields.category  = String(op.payload.category);
            if (op.payload.code      !== undefined) updateFields.code      = op.payload.code
              ? String(op.payload.code).trim()
              : undefined;

            if (Object.keys(updateFields).length > 0) {
              await Product.findOneAndUpdate(
                { id: op.productId },
                { $set: updateFields },
                { runValidators: true }
              );
            }
            results.push({ id: op.id, success: true });
            break;
          }

          // ── Delete ──────────────────────────────────────────────────────
          case "delete": {
            // Idempotent: if product doesn't exist, treat as success
            await Product.findOneAndDelete({ id: op.productId });
            results.push({ id: op.id, success: true });
            break;
          }

          default:
            results.push({ id: op.id, success: false, error: "Unknown operation type" });
        }
      } catch (opErr) {
        console.error(`[sync] Operation ${op.id} (${op.type} ${op.productId}) failed:`, opErr);
        results.push({ id: op.id, success: false, error: "Operation failed on server" });
      }
    }

    return NextResponse.json({ results }, { status: 200 });
  } catch (err) {
    console.error("[sync] POST /api/sync error:", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
