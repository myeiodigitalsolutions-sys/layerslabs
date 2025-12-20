// routes/notificationRoutes.js
const express = require('express');
const Notification = require('../models/Notification');
const verifyToken = require('../middleware/auth');

const router = express.Router();

// GET notifications for logged-in user
router.get('/', verifyToken, async (req, res) => {
  try {
    const uid = (req.user && req.user.uid) || req.uid || (req.decodedToken && req.decodedToken.uid);
    if (!uid) return res.status(401).json({ error: 'Unauthenticated' });

    const notes = await Notification.find({ uid }).sort({ createdAt: -1 }).limit(50).lean();
    return res.json(notes);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

// PATCH mark notification read
router.patch('/:id/read', verifyToken, async (req, res) => {
  try {
    const uid = (req.user && req.user.uid) || req.uid || (req.decodedToken && req.decodedToken.uid);
    const id = req.params.id;
    const note = await Notification.findOne({ _id: id, uid });
    if (!note) return res.status(404).json({ error: 'Not found' });
    note.read = true;
    await note.save();
    return res.json({ success: true, notification: note });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
