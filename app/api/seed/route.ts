import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Product from "@/lib/models/Product";
import Category from "@/lib/models/Category";
import { defaultProducts, defaultCategories } from "@/app/data";

// ─── POST /api/seed ───────────────────────────────────────────────────────────
// Migrates all default products and categories from data.ts into MongoDB.
//
// Behaviour:
//   - SAFE to call multiple times (idempotent via upsert).
//   - Products/categories already in DB are NOT overwritten — user
//     customisations (price edits, renames) are preserved.
//   - Missing default products/categories are added automatically.
//
// Use this endpoint:
//   1. Once after first deployment to populate the DB.
//   2. When clicking "Reset Defaults" in the Store Manager UI to restore
//      any accidentally deleted default items.
export async function POST() {
  try {
    await dbConnect();

    // ── Seed Categories ──────────────────────────────────────────────────────
    const categoryOps = defaultCategories.map((cat) => ({
      updateOne: {
        filter: { id: cat.id },
        update: { $setOnInsert: { id: cat.id, name: cat.name, nameUrdu: cat.nameUrdu } },
        upsert: true,
      },
    }));
    const categoryResult = await Category.bulkWrite(categoryOps, { ordered: false });

    // ── Seed Products ────────────────────────────────────────────────────────
    // $setOnInsert means: if the document already exists, do NOT touch it.
    // This preserves any user-edited prices or names.
    const productOps = defaultProducts.map((p) => ({
      updateOne: {
        filter: { id: p.id },
        update: {
          $setOnInsert: {
            id: p.id,
            name: p.name,
            nameUrdu: p.nameUrdu,
            price: p.price,
            category: p.category,
            code: p.code,
          },
        },
        upsert: true,
      },
    }));
    const productResult = await Product.bulkWrite(productOps, { ordered: false });

    return NextResponse.json(
      {
        success: true,
        message: "Database seeded successfully",
        categories: {
          inserted: categoryResult.upsertedCount,
          alreadyExisted: categoryResult.matchedCount,
        },
        products: {
          inserted: productResult.upsertedCount,
          alreadyExisted: productResult.matchedCount,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("POST /api/seed error:", error);
    return NextResponse.json(
      { error: "Seeding failed. Check server logs for details." },
      { status: 500 }
    );
  }
}

// ─── GET /api/seed ────────────────────────────────────────────────────────────
// Returns current count of products and categories in the DB.
// Useful for checking if the DB has been seeded.
export async function GET() {
  try {
    await dbConnect();
    const [productCount, categoryCount] = await Promise.all([
      Product.countDocuments(),
      Category.countDocuments(),
    ]);

    return NextResponse.json({
      seeded: productCount > 0,
      products: productCount,
      categories: categoryCount,
      defaultProducts: defaultProducts.length,
      defaultCategories: defaultCategories.length,
    });
  } catch (error) {
    console.error("GET /api/seed error:", error);
    return NextResponse.json(
      { error: "Failed to check seed status" },
      { status: 500 }
    );
  }
}
