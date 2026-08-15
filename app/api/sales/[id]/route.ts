import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Sale from "@/lib/models/Sale";

// GET /api/sales/[id] — fetch a single sale by MongoDB _id or invoiceNumber
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const { id } = await params;

    // Try by MongoDB _id first, then by invoiceNumber
    const sale = await Sale.findById(id).lean().catch(() => null)
      ?? await Sale.findOne({ invoiceNumber: id }).lean();

    if (!sale) {
      return NextResponse.json({ error: "Sale not found" }, { status: 404 });
    }

    return NextResponse.json({
      _id:            sale._id?.toString(),
      invoiceNumber:  sale.invoiceNumber,
      customerId:     sale.customerId,
      customerName:   sale.customerName,
      items:          sale.items,
      subtotal:       sale.subtotal,
      discountAmount: sale.discountAmount,
      totalAmount:    sale.totalAmount,
      paymentMethod:  sale.paymentMethod,
      paymentStatus:  sale.paymentStatus,
      status:         sale.status ?? "active",
      replacedBy:     sale.replacedBy,
      replacedFrom:   sale.replacedFrom,
      editNote:       sale.editNote,
      createdAt:      sale.createdAt?.toISOString() ?? "",
    });
  } catch (error) {
    console.error("GET /api/sales/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch sale" }, { status: 500 });
  }
}
