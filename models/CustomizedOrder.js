const mongoose = require("mongoose");

const customizedOrderSchema = new mongoose.Schema(
  {
    uid: String,

    name: String,
    email: String,
    phone: String,
    address: String,
    city: String,
    state: String,
    pincode: String,

    images: [String],
    height: Number,
    length: Number,
    material: String,
    notes: String,

    price: Number,
    payment: String,
    paymentStatus: String,
    status: String,
    expectedDelivery: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model("CustomizedOrder", customizedOrderSchema);
