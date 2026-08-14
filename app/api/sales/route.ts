import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Sale from "@/lib/models/Sale";
import Customer from "@/lib/models/Customer";

// POST /api/sales — persist a completed sale
export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const body = await req.json();

    if (!body.invoiceNumber || !body.items?.length) {
      return NextResponse.json(
        { error: "invoiceNumber and items are required" },
        { status: 400 }
      );
    }

    const paymentMethod: "cash" | "card" | "credit" = body.paymentMethod ?? "cash";
    const paymentStatus: "paid" | "pending" =
      paymentMethod === "credit" ? "pending" : "paid";

    const sale = await Sale.create({
      invoiceNumber:  body.invoiceNumber,
      customerId:     body.customerId   ?? undefined,
      customerName:   body.customerName ?? undefined,
      items:          body.items,
      subtotal:       Number(body.subtotal),
      discountAmount: Number(body.discountAmount ?? 0),
      totalAmount:    Number(body.totalAmount),
      paymentMethod,
      paymentStatus,
    });

    // If payment method is credit and a customer is linked,
    // increase their outstanding balance
    if (paymentMethod === "credit" && body.customerId) {
      await Customer.findOneAndUpdate(
        { customerId: body.customerId },
        { $inc: { outstandingBalance: Number(body.totalAmount) } }
      );
    }

    return NextResponse.json(
      {
        _id:            sale._id?.toString(),
        invoiceNumber:  sale.invoiceNumber,
        customerId:     sale.customerId,
        totalAmount:    sale.totalAmount,
        paymentMethod:  sale.paymentMethod,
        paymentStatus:  sale.paymentStatus,
        createdAt:      sale.createdAt.toISOString(),
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error("POST /api/sales error:", error);
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: number }).code === 11000
    ) {
      // Duplicate invoice number — silently treat as success (idempotent)
      return NextResponse.json({ ok: true, duplicate: true }, { status: 200 });
    }
    return NextResponse.json({ error: "Failed to save sale" }, { status: 500 });
  }
}

// GET /api/sales — list recent sales (optional ?customerId=xxx filter)
export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const customerId = req.nextUrl.searchParams.get("customerId");

    const query = customerId ? { customerId } : {};

    const sales = await Sale.find(query)
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    return NextResponse.json(
      sales.map((s) => ({
        _id:            s._id?.toString(),
        invoiceNumber:  s.invoiceNumber,
        customerId:     s.customerId,
        customerName:   s.customerName,
        items:          s.items,
        subtotal:       s.subtotal,
        discountAmount: s.discountAmount,
        totalAmount:    s.totalAmount,
        paymentMethod:  s.paymentMethod,
        paymentStatus:  s.paymentStatus,
        createdAt:      s.createdAt?.toISOString() ?? "",
      })),
      { status: 200 }
    );
  } catch (error) {
    console.error("GET /api/sales error:", error);
    return NextResponse.json({ error: "Failed to fetch sales" }, { status: 500 });
  }
}
