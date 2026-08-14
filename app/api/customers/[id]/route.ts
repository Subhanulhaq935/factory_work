import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Customer from "@/lib/models/Customer";
import Sale from "@/lib/models/Sale";
import CustomerPayment from "@/lib/models/CustomerPayment";

// GET /api/customers/[id] — single customer with summary stats
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const { id } = await params;

    const customer = await Customer.findOne({ customerId: id }).lean();
    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    // Aggregate stats from sales and payments
    const sales = await Sale.find({ customerId: id }).sort({ createdAt: -1 });
    const payments = await CustomerPayment.find({ customerId: id }).sort({ createdAt: -1 });

    const totalPurchases = sales.length;
    const totalAmount    = sales.reduce((s, sale) => s + sale.totalAmount, 0);
    const paidUpfront    = sales.filter((s) => s.paymentMethod !== "credit").reduce((s, sale) => s + sale.totalAmount, 0);
    const paidViaLedger  = payments.reduce((s, p) => s + p.amount, 0);
    const totalPaid      = paidUpfront + paidViaLedger;
    const outstanding    = Math.max(0, customer.outstandingBalance ?? 0);

    // Synchronize paymentStatus on credit sales (FIFO order)
    const creditSalesChronological = [...sales]
      .filter((s) => s.paymentMethod === "credit")
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    let remainingCreditPayment = paidViaLedger;

    for (const cs of creditSalesChronological) {
      if (outstanding === 0 || remainingCreditPayment >= cs.totalAmount) {
        if (cs.paymentStatus !== "paid") {
          await Sale.findByIdAndUpdate(cs._id, { paymentStatus: "paid" });
          cs.paymentStatus = "paid";
        }
        remainingCreditPayment = Math.max(0, remainingCreditPayment - cs.totalAmount);
      } else {
        if (cs.paymentStatus !== "pending") {
          await Sale.findByIdAndUpdate(cs._id, { paymentStatus: "pending" });
          cs.paymentStatus = "pending";
        }
      }
    }

    return NextResponse.json(
      {
        customer: {
          customerId:         customer.customerId,
          name:               customer.name,
          phone:              customer.phone,
          address:            customer.address,
          outstandingBalance: customer.outstandingBalance,
          createdAt:          customer.createdAt?.toISOString() ?? "",
          updatedAt:          customer.updatedAt?.toISOString() ?? "",
        },
        stats: { totalPurchases, totalAmount, totalPaid, outstanding },
        sales: sales.map((s) => ({
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
        payments: payments.map((p) => ({
          _id:           p._id?.toString(),
          customerId:    p.customerId,
          amount:        p.amount,
          paymentMethod: p.paymentMethod,
          notes:         p.notes,
          createdAt:     p.createdAt?.toISOString() ?? "",
        })),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("GET /api/customers/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch customer" }, { status: 500 });
  }
}

// PUT /api/customers/[id] — update customer details
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const { id } = await params;
    const body = await req.json();

    const updateFields: Record<string, unknown> = {};
    if (body.name)    updateFields.name    = body.name.trim();
    if (body.phone)   updateFields.phone   = body.phone.trim();
    if (body.address !== undefined) updateFields.address = body.address.trim();

    const updated = await Customer.findOneAndUpdate(
      { customerId: id },
      { $set: updateFields },
      { new: true, runValidators: true }
    ).lean();

    if (!updated) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    return NextResponse.json({
      customerId:         updated.customerId,
      name:               updated.name,
      phone:              updated.phone,
      address:            updated.address,
      outstandingBalance: updated.outstandingBalance,
      createdAt:          updated.createdAt?.toISOString() ?? "",
      updatedAt:          updated.updatedAt?.toISOString() ?? "",
    });
  } catch (error) {
    console.error("PUT /api/customers/[id] error:", error);
    return NextResponse.json({ error: "Failed to update customer" }, { status: 500 });
  }
}
