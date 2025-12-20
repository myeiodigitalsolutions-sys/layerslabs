// routes/cartRoutes.js
const express = require('express');
const verifyToken = require('../middleware/auth');
const User = require('../models/User');

const router = express.Router();

// GET user's cart
router.get('/my', verifyToken, async (req, res) => {
  try {
    const uid = req.uid;
    const user = await User.findOne({ uid });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const cart = user.cart || [];
    res.json(cart);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADD item to cart
router.post('/add', verifyToken, async (req, res) => {
  try {
    const uid = req.uid;
    const { productId, name, price, image, qty = 1 } = req.body;

    if (!productId || !name || !price) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const user = await User.findOne({ uid });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Initialize cart if not exists
    if (!user.cart) user.cart = [];

    // Check if item already in cart
    const existingItem = user.cart.find(item => item.productId === productId);
    if (existingItem) {
      existingItem.qty += qty;
    } else {
      user.cart.push({ productId, name, price, image, qty });
    }

    await user.save();
    res.json({ success: true, cart: user.cart });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// REMOVE item from cart
router.post('/remove', verifyToken, async (req, res) => {
  try {
    const uid = req.uid;
    const { productId } = req.body;

    const user = await User.findOne({ uid });
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.cart = user.cart.filter(item => item.productId !== productId);
    await user.save();

    res.json({ success: true, cart: user.cart });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE quantity
router.post('/update', verifyToken, async (req, res) => {
  try {
    const uid = req.uid;
    const { productId, qty } = req.body;

    const user = await User.findOne({ uid });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const item = user.cart.find(i => i.productId === productId);
    if (item) {
      item.qty = qty > 0 ? qty : 1;
    }

    await user.save();
    res.json({ success: true, cart: user.cart });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CLEAR cart
router.post('/clear', verifyToken, async (req, res) => {
  try {
    const uid = req.uid;
    const user = await User.findOne({ uid });
    if (user) {
      user.cart = [];
      await user.save();
    }
    res.json({ success: true, cart: [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;