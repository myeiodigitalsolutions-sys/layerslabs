// models/User.js - add this field

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    uid: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String },
    photoURL: String,
    address: { type: String, default: '' },
    state: { type: String, default: 'Tamil Nadu' },
    city: { type: String, default: '' },
    pincode: { type: String, default: '' },
    phone: { type: String, default: '' },

    // ADD THIS: Cart array
    cart: [
      {
        productId: { type: String, required: true },
        name: { type: String, required: true },
        price: { type: Number, required: true },
        image: { type: String },
        qty: { type: Number, default: 1 },
      }
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);