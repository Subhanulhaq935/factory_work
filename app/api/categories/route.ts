import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Category from "@/lib/models/Category";

// GET /api/categories - Returns all categories
export async function GET() {
  try {
    await dbConnect();
    const categories = await Category.find({}).lean();

    const serialized = categories.map((c) => ({
      id: c.id,
      name: c.name,
      nameUrdu: c.nameUrdu,
    }));

    return NextResponse.json(serialized, { status: 200 });
  } catch (error) {
    console.error("GET /api/categories error:", error);
    return NextResponse.json(
      { error: "Failed to fetch categories" },
      { status: 500 }
    );
  }
}
