import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Customer from "@/lib/models/Customer";
import CustomerPayment from "@/lib/models/CustomerPayment";
import Sale from "@/lib/models/Sale";

// GET /api/customers/[id]/payments — payment history for a customer
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const { id } = await params;

    const payments = await CustomerPayment.find({ customerId: id })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json(
      payments.map((p) => ({
        _id:           p._id?.toString(),
        customerId:    p.customerId,
        amount:        p.amount,
        paymentMethod: p.paymentMethod,
        notes:         p.notes,
        createdAt:     p.createdAt?.toISOString() ?? "",
      })),
      { status: 200 }
    );
  } catch (error) {
    console.error("GET /api/customers/[id]/payments error:", error);
    return NextResponse.json({ error: "Failed to fetch payments" }, { status: 500 });
  }
}

// POST /api/customers/[id]/payments — record a payment, reduce outstanding balance
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const { id } = await params;
    const body = await req.json();

    if (!body.amount || Number(body.amount) <= 0) {
      return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
    }

    const customer = await Customer.findOne({ customerId: id });
    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const paymentAmount = Math.min(Number(body.amount), customer.outstandingBalance);

    if (paymentAmount <= 0) {
      return NextResponse.json(
        { error: "No outstanding balance to pay" },
        { status: 400 }
      );
    }

    // Create payment record
    const payment = await CustomerPayment.create({
      customerId:    id,
      amount:        paymentAmount,
      paymentMethod: body.paymentMethod ?? "cash",
      notes:         body.notes?.trim() ?? "",
    });

    // Reduce outstanding balance
    customer.outstandingBalance = Math.max(0, customer.outstandingBalance - paymentAmount);
    await customer.save();

    // Synchronize paymentStatus on credit sales (FIFO order)
    const allPayments = await CustomerPayment.find({ customerId: id });
    const totalPaymentsReceived = allPayments.reduce((s, p) => s + p.amount, 0);

    const creditSales = await Sale.find({ customerId: id, paymentMethod: "credit" }).sort({ createdAt: 1 });
    let runningPayment = totalPaymentsReceived;

    for (const cs of creditSales) {
      if (customer.outstandingBalance === 0 || runningPayment >= cs.totalAmount) {
        if (cs.paymentStatus !== "paid") {
          await Sale.findByIdAndUpdate(cs._id, { paymentStatus: "paid" });
        }
        runningPayment = Math.max(0, runningPayment - cs.totalAmount);
      }
    }

    return NextResponse.json(
      {
        payment: {
          _id:           payment._id?.toString(),
          customerId:    payment.customerId,
          amount:        payment.amount,
          paymentMethod: payment.paymentMethod,
          notes:         payment.notes,
          createdAt:     payment.createdAt.toISOString(),
        },
        newOutstandingBalance: customer.outstandingBalance,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/customers/[id]/payments error:", error);
    return NextResponse.json({ error: "Failed to record payment" }, { status: 500 });
  }
}
