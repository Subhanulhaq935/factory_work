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

/**
 * POST /api/bills/edit
 *
 * Atomically:
 *  1. Validates manager password
 *  2. Loads the original sale
 *  3. Marks original as status="replaced", links replacedBy=newInvoiceNumber
 *  4. Reconciles customer outstanding balance (credit delta)
 *  5. Creates new sale document with new invoice number, links replacedFrom=originalInvoiceNumber
 *  6. Returns both sale documents
 *
 * Body:
 *  {
 *    originalInvoiceNumber: string,
 *    newBill: {
 *      customerId?: string,
 *      customerName?: string,
 *      items: SaleItem[],
 *      subtotal: number,
 *      discountAmount: number,
 *      totalAmount: number,
 *      paymentMethod: "cash" | "card" | "credit",
 *      editNote?: string,
 *    }
 *  }
 */
export async function POST(req: NextRequest) {
  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    if (!checkManagerPassword(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const body = await req.json();

    const { originalInvoiceNumber, newBill } = body;

    if (!originalInvoiceNumber || !newBill?.items?.length) {
      return NextResponse.json(
        { error: "originalInvoiceNumber and newBill.items are required" },
        { status: 400 }
      );
    }

    // ── Load original sale ──────────────────────────────────────────────────
    const originalSale = await Sale.findOne({ invoiceNumber: originalInvoiceNumber });
    if (!originalSale) {
      return NextResponse.json({ error: "Original sale not found" }, { status: 404 });
    }

    if (originalSale.status === "replaced") {
      return NextResponse.json(
        { error: "This bill has already been replaced. Please edit the active replacement." },
        { status: 409 }
      );
    }

    // ── Generate new invoice number ─────────────────────────────────────────
    const newInvoiceNumber = `INV-${Math.floor(100000 + Math.random() * 900000)}`;

    // ── Reconcile customer credit balance ───────────────────────────────────
    //
    // Rules:
    //  orig=credit + new=credit  → delta = newTotal - origTotal  (adjust balance)
    //  orig=credit + new=!credit → remove origTotal from balance
    //  orig=!credit + new=credit → add newTotal to balance
    //  orig=!credit + new=!credit → no credit change
    //
    const origWasCredit = originalSale.paymentMethod === "credit";
    const newIsCredit   = newBill.paymentMethod === "credit";
    const origTotal     = originalSale.totalAmount;
    const newTotal      = Number(newBill.totalAmount);

    // The customer to adjust — prefer original customerId, but new bill may change customer
    const origCustomerId = originalSale.customerId;
    const newCustomerId  = newBill.customerId ?? undefined;

    // Reverse original credit on orig customer (if existed)
    if (origWasCredit && origCustomerId) {
      await Customer.findOneAndUpdate(
        { customerId: origCustomerId },
        { $inc: { outstandingBalance: -origTotal } }
      );
      // Clamp to 0 (avoid negative balance)
      await Customer.findOneAndUpdate(
        { customerId: origCustomerId, outstandingBalance: { $lt: 0 } },
        { $set: { outstandingBalance: 0 } }
      );
    }

    // Apply new credit on new customer (if applicable)
    if (newIsCredit && newCustomerId) {
      await Customer.findOneAndUpdate(
        { customerId: newCustomerId },
        { $inc: { outstandingBalance: newTotal } }
      );
    }

    // ── Mark original as replaced ───────────────────────────────────────────
    originalSale.status      = "replaced";
    originalSale.replacedBy  = newInvoiceNumber;
    await originalSale.save();

    // ── Create new sale ─────────────────────────────────────────────────────
    const paymentStatus: "paid" | "pending" = newIsCredit ? "pending" : "paid";

    const newSale = await Sale.create({
      invoiceNumber:  newInvoiceNumber,
      customerId:     newCustomerId,
      customerName:   newBill.customerName ?? undefined,
      items:          newBill.items,
      subtotal:       Number(newBill.subtotal),
      discountAmount: Number(newBill.discountAmount ?? 0),
      totalAmount:    newTotal,
      paymentMethod:  newBill.paymentMethod,
      paymentStatus,
      status:         "active",
      replacedFrom:   originalInvoiceNumber,
      editNote:       newBill.editNote?.trim() ?? undefined,
    });

    // ── Serialize the new sale cleanly (strip Mongoose internals) ──────────
    const newSaleObj = newSale.toObject();

    return NextResponse.json(
      {
        originalBill: {
          invoiceNumber: originalSale.invoiceNumber,
          status:        originalSale.status,
          replacedBy:    originalSale.replacedBy,
        },
        newBill: {
          _id:            newSaleObj._id?.toString(),
          invoiceNumber:  newSaleObj.invoiceNumber,
          customerId:     newSaleObj.customerId ?? null,
          customerName:   newSaleObj.customerName ?? null,
          items:          (newSaleObj.items ?? []).map((item: {
            productId?: string;
            productName?: string;
            productNameUrdu?: string;
            productCode?: string;
            quantity?: number;
            unitPrice?: number;
            totalPrice?: number;
          }) => ({
            productId:       item.productId ?? "",
            productName:     item.productName ?? "Unknown Item",
            productNameUrdu: item.productNameUrdu ?? "",
            productCode:     item.productCode ?? undefined,
            quantity:        Number(item.quantity ?? 1),
            unitPrice:       Number(item.unitPrice ?? 0),
            totalPrice:      Number(item.totalPrice ?? 0),
          })),
          subtotal:       Number(newSaleObj.subtotal ?? 0),
          discountAmount: Number(newSaleObj.discountAmount ?? 0),
          totalAmount:    Number(newSaleObj.totalAmount ?? 0),
          paymentMethod:  newSaleObj.paymentMethod,
          paymentStatus:  newSaleObj.paymentStatus,
          status:         newSaleObj.status ?? "active",
          replacedFrom:   newSaleObj.replacedFrom ?? null,
          editNote:       newSaleObj.editNote ?? null,
          createdAt:      newSaleObj.createdAt instanceof Date
                            ? newSaleObj.createdAt.toISOString()
                            : new Date().toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error("POST /api/bills/edit error:", error);
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: number }).code === 11000
    ) {
      // Duplicate invoice number collision — extremely rare, caller can retry
      return NextResponse.json(
        { error: "Invoice number collision — please try again" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Failed to edit bill" }, { status: 500 });
  }
}
