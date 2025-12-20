// routes/userRoutes.js
const express = require('express');
const User = require('../models/User.js');
const verifyToken = require('../middleware/auth.js');

const router = express.Router();

// 1. Initial user sync/creation on login (call this once after Firebase sign-in)
router.post('/', verifyToken, async (req, res) => {
  try {
    // Expect uid to come from verifyToken middleware
    const uid = req.uid; // This should be set by verifyToken
    if (!uid) {
      return res.status(401).json({ error: 'No UID from token' });
    }

    const { name, email, photoURL } = req.body;

    let user = await User.findOne({ uid });
    if (!user) {
      user = await User.create({
        uid,
        name: name || 'User',
        email: email || '',
        photoURL: photoURL || '',
        address: '',
        state: 'Tamil Nadu',
        city: '',
        pincode: '',
        phone: '',
      });
    } else {
      // Update basic info if provided
      if (name) user.name = name;
      if (email) user.email = email;
      if (photoURL) user.photoURL = photoURL;
      await user.save();
    }

    return res.json({ success: true, user });
  } catch (err) {
    console.error('Error in POST /api/users:', err);
    return res.status(500).json({ error: err.message });
  }
});

// 2. Update full profile (address, phone, etc.)
router.post('/profile', verifyToken, async (req, res) => {
  try {
    const uid = req.uid;
    if (!uid) {
      return res.status(401).json({ error: 'Unauthenticated' });
    }

    const { name, address, state, city, pincode, phone, email } = req.body;

    if (!name || !address || !state || !city || !pincode || !phone) {
      return res.status(400).json({ error: "All fields are required" });
    }

    let user = await User.findOne({ uid });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    Object.assign(user, {
      name,
      address,
      state,
      city,
      pincode,
      phone,
      email,
    });

    await user.save();
    res.json({ success: true, user });
  } catch (err) {
    console.error('Error in POST /profile:', err);
    res.status(500).json({ error: err.message });
  }
});
router.get('/profile', verifyToken, async (req, res) => {
  try {
    const uid = req.uid;
    if (!uid) {
      return res.status(401).json({ error: 'Unauthenticated' });
    }

    let user = await User.findOne({ uid });

    if (!user) {
      // Only create minimal required fields
      user = await User.create({
        uid,
        name: req.user.name || req.user.displayName || 'User',
        email: req.user.email || '',
        photoURL: req.user.photoURL || '',
        // Do NOT include address, city, pincode, phone → let user fill later
        state: 'Tamil Nadu', // if required
      });
    }

    return res.json({ success: true, user });
  } catch (err) {
    console.error('Error in GET /profile:', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;