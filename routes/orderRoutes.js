const router = require("express").Router();
const Order = require("../models/Order");
const verifyToken = require("../middleware/auth");
const Razorpay = require("razorpay");
const crypto = require("crypto");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

router.post("/", verifyToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { product, ...rest } = req.body;

    let items = [];
    let total = 0;

    if (Array.isArray(product)) {
      for (const p of product) {
        let price = Number(p.price || 0);
        let qty = Number(p.qty || 1);

        items.push({
          productId: p.productId || null,
          name: p.name,
          price,
          qty,
          image: p.image
        });

        total += price * qty;
      }
    }

    const payment = rest.payment || "COD";
    const paymentStatus = payment === "COD" ? "completed" : "pending";

    const order = await Order.create({
      userId: uid,
      type: "product",

      name: rest.name,
      email: rest.email,
      phone: rest.phone,
      address: rest.address,
      state: rest.state,
      city: rest.city,
      pincode: rest.pincode,

      product: {
        items,
        total
      },

      payment,
      paymentStatus,
      status: "pending"
    });

    res.status(201).json(order);
  } catch (err) {
    console.error("Create order error:", err);
    res.status(500).json({ message: "Failed to create order" });
  }
});

// New route: Create Razorpay order for an existing app order
router.post("/create-razorpay/:id", verifyToken, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order || order.payment !== "ONLINE" || order.paymentStatus !== "pending") {
      return res.status(400).json({ message: "Invalid order for payment" });
    }

    const rpOptions = {
      amount: order.product.total * 100, // Convert Rs to paise
      currency: "INR",
      receipt: order._id.toString(),
    };

    const rpOrder = await razorpay.orders.create(rpOptions);
    order.razorpay.orderId = rpOrder.id;
    await order.save();

    res.json({
      razorpayOrderId: rpOrder.id,
      key: process.env.RAZORPAY_KEY_ID,
      amount: rpOptions.amount,
      currency: rpOptions.currency,
      name: order.name,
      email: order.email,
      phone: order.phone,
      prefill: { // Optional: For checkout prefill
        name: order.name,
        email: order.email,
        contact: order.phone,
      },
    });
  } catch (err) {
    console.error("Razorpay order creation error:", err);
    res.status(500).json({ message: "Failed to create Razorpay order" });
  }
});

// New route: Verify payment and update order
router.post("/verify-payment/:id", verifyToken, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order || order.payment !== "ONLINE") {
      return res.status(400).json({ message: "Invalid order" });
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (order.razorpay.orderId !== razorpay_order_id) {
      return res.status(400).json({ message: "Order ID mismatch" });
    }

    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    if (expectedSignature === razorpay_signature) {
      order.razorpay.paymentId = razorpay_payment_id;
      order.razorpay.signature = razorpay_signature;
      order.paymentStatus = "completed";
      await order.save();
      return res.json({ success: true });
    } else {
      order.paymentStatus = "failed";
      await order.save();
      return res.status(400).json({ success: false, message: "Invalid signature" });
    }
  } catch (err) {
    console.error("Payment verification error:", err);
    res.status(500).json({ message: "Verification failed" });
  }
});

// ADMIN – get all orders
router.get("/", verifyToken, async (req, res) => {
  const orders = await Order.find().sort({ createdAt: -1 });
  res.json(orders);
});

// USER – get own orders
router.get("/my", verifyToken, async (req, res) => {
  const uid = req.user.uid;
  const orders = await Order.find({ userId: uid }).sort({ createdAt: -1 });
  res.json(orders);
});

// ADMIN – update order status
router.patch("/:id", verifyToken, async (req, res) => {
  const { status } = req.body;
  const order = await Order.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true }
  );
  res.json(order);
});

module.exports = router;