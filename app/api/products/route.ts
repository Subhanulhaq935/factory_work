import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Product from "@/lib/models/Product";

// GET /api/products - Returns all products sorted by category
export async function GET() {
  try {
    await dbConnect();
    const products = await Product.find({}).sort({ category: 1, id: 1 }).lean();

    const serialized = products.map((p) => ({
      id: p.id,
      name: p.name,
      nameUrdu: p.nameUrdu,
      price: p.price,
      category: p.category,
      code: p.code,
    }));

    return NextResponse.json(serialized, { status: 200 });
  } catch (error) {
    console.error("GET /api/products error:", error);
    return NextResponse.json(
      { error: "Failed to fetch products" },
      { status: 500 }
    );
  }
}

// POST /api/products - Creates a new product
export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const body = await req.json();

    if (!body.name || body.price === undefined || !body.category) {
      return NextResponse.json(
        { error: "name, price, and category are required" },
        { status: 400 }
      );
    }

    const newId = body.id || `prod_${Date.now()}`;

    const product = await Product.create({
      id: newId,
      name: body.name.trim(),
      nameUrdu: body.nameUrdu?.trim() || "",
      price: Number(body.price),
      category: body.category,
      code: body.code?.trim() || undefined,
    });

    return NextResponse.json(
      {
        id: product.id,
        name: product.name,
        nameUrdu: product.nameUrdu,
        price: product.price,
        category: product.category,
        code: product.code,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error("POST /api/products error:", error);
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: number }).code === 11000
    ) {
      return NextResponse.json(
        { error: "A product with this ID already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Failed to create product" },
      { status: 500 }
    );
  }
}
