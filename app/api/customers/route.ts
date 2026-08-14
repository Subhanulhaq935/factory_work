import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Customer from "@/lib/models/Customer";

// GET /api/customers?search=xxx
// Returns all customers, optionally filtered by name or phone
export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const search = req.nextUrl.searchParams.get("search")?.trim() ?? "";

    const query = search
      ? {
          $or: [
            { name: { $regex: search, $options: "i" } },
            { phone: { $regex: search, $options: "i" } },
          ],
        }
      : {};

    // Full sync (no search) → return up to 1000 for offline cache.
    // Filtered search → return up to 50 results.
    const limit = search ? 50 : 1000;
    const customers = await Customer.find(query)
      .sort({ name: 1 })
      .limit(limit)
      .lean();

    const serialized = customers.map((c) => ({
      customerId:          c.customerId,
      name:                c.name,
      phone:               c.phone,
      address:             c.address,
      outstandingBalance:  c.outstandingBalance,
      createdAt:           c.createdAt?.toISOString() ?? "",
      updatedAt:           c.updatedAt?.toISOString() ?? "",
    }));

    return NextResponse.json(serialized, { status: 200 });
  } catch (error) {
    console.error("GET /api/customers error:", error);
    return NextResponse.json({ error: "Failed to fetch customers" }, { status: 500 });
  }
}

// POST /api/customers — create a new customer
// Returns 409 if a customer with the same phone already exists
export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const body = await req.json();

    if (!body.name?.trim() || !body.phone?.trim()) {
      return NextResponse.json(
        { error: "name and phone are required" },
        { status: 400 }
      );
    }

    // Check for existing customer with same phone
    const existing = await Customer.findOne({ phone: body.phone.trim() }).lean();
    if (existing) {
      return NextResponse.json(
        {
          error: "duplicate_phone",
          message: "A customer with this phone number already exists.",
          existing: {
            customerId:         existing.customerId,
            name:               existing.name,
            phone:              existing.phone,
            address:            existing.address,
            outstandingBalance: existing.outstandingBalance,
            createdAt:          existing.createdAt?.toISOString() ?? "",
            updatedAt:          existing.updatedAt?.toISOString() ?? "",
          },
        },
        { status: 409 }
      );
    }

    const customerId = `CUST-${Date.now()}`;

    const customer = await Customer.create({
      customerId,
      name:    body.name.trim(),
      phone:   body.phone.trim(),
      address: body.address?.trim() ?? "",
      outstandingBalance: 0,
    });

    return NextResponse.json(
      {
        customerId:         customer.customerId,
        name:               customer.name,
        phone:              customer.phone,
        address:            customer.address,
        outstandingBalance: customer.outstandingBalance,
        createdAt:          customer.createdAt.toISOString(),
        updatedAt:          customer.updatedAt.toISOString(),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/customers error:", error);
    return NextResponse.json({ error: "Failed to create customer" }, { status: 500 });
  }
}
