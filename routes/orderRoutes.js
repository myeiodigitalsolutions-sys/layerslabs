const router = require("express").Router();
const Order = require("../models/Order");
const verifyToken = require("../middleware/auth");

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

      payment: rest.payment || "COD",
      status: "pending"
    });

    res.status(201).json(order);
  } catch (err) {
    console.error("Create order error:", err);
    res.status(500).json({ message: "Failed to create order" });
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
