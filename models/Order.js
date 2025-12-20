const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    userId: String,
    type: { type: String, enum: ["product", "customized"], required: true },

    // user info
    name: String,
    email: String,
    phone: String,
    address: String,
    state: String,
    city: String,
    pincode: String,

    // product order
    product: Object,

    // customized order
    customized: Object,

    payment: String,
    status: {
      type: String,
      enum: ["pending", "processing", "shipped", "delivered"],
      default: "pending",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);
