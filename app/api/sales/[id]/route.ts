import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Sale from "@/lib/models/Sale";
import Customer from "@/lib/models/Customer";

// ── Server-side password helper ───────────────────────────────────────────────
function checkManagerPassword(req: NextRequest): boolean {
  const pwd = process.env.MANAGER_PASSWORD ?? process.env.NEXT_PUBLIC_MANAGER_PASSWORD ?? "";
  if (!pwd) return true; // No password configured → open
  const header = req.headers.get("x-manager-password") ?? "";
  return header === pwd;
}

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

// DELETE /api/sales/[id] — permanently delete a sale by MongoDB _id or invoiceNumber
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!checkManagerPassword(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const { id } = await params;

    // Find the sale first
    const sale = await Sale.findById(id).catch(() => null)
      ?? await Sale.findOne({ invoiceNumber: id });

    if (!sale) {
      return NextResponse.json({ error: "Sale not found" }, { status: 404 });
    }

    // If the bill was credit and active, reverse customer's outstanding balance
    if (sale.paymentMethod === "credit" && sale.status === "active" && sale.customerId) {
      await Customer.findOneAndUpdate(
        { customerId: sale.customerId },
        { $inc: { outstandingBalance: -sale.totalAmount } }
      );
      // Clamp to 0 (avoid negative balance)
      await Customer.findOneAndUpdate(
        { customerId: sale.customerId, outstandingBalance: { $lt: 0 } },
        { $set: { outstandingBalance: 0 } }
      );
    }

    // Delete the sale document from MongoDB
    await Sale.deleteOne({ _id: sale._id });

    return NextResponse.json({
      success: true,
      message: "Bill deleted successfully",
      deletedInvoiceNumber: sale.invoiceNumber,
    });
  } catch (error) {
    console.error("DELETE /api/sales/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete sale" }, { status: 500 });
  }
}

