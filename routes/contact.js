// routes/contact.js
const express = require('express');
const router = express.Router();
const ContactMessage = require('../models/ContactMessage');

// POST /api/contact - Save contact message
router.post('/', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const newMessage = new ContactMessage({
      name,
      email,
      subject,
      message
    });

    const saved = await newMessage.save();

    res.status(201).json({ success: true, id: saved._id });
  } catch (err) {
    console.error('Contact save error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// GET /api/contact - Get all messages (sorted newest first)
router.get('/', async (req, res) => {
  try {
    const messages = await ContactMessage.find({})
      .sort({ createdAt: -1 });

    res.json(messages);
  } catch (err) {
    console.error('Fetch contact messages error:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

module.exports = router;