// routes/customizedRoutes.js
const express = require('express');
const router = express.Router();

const CustomizedOrder = require('../models/CustomizedOrder');
const Notification = require('../models/Notification');
const User = require('../models/User');
const verifyToken = require('../middleware/auth');
const { bucket } = require('../firebaseAdmin');

const SibApiV3Sdk = require('sib-api-v3-sdk');

// =====================
// Brevo API Setup
// =====================
const client = SibApiV3Sdk.ApiClient.instance;
client.authentications['api-key'].apiKey = process.env.BREVO_API_KEY;
const transactionalApi = new SibApiV3Sdk.TransactionalEmailsApi();

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

// =====================
// Helper: Upload base64 to Firebase
// =====================
async function uploadFileToFirebase(base64String, originalName) {
  if (!base64String) return null;

  const matches = base64String.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    throw new Error('Invalid base64 string');
  }

  const mimeType = matches[1];
  const buffer = Buffer.from(matches[2], 'base64');

  const ext =
    originalName?.split('.').pop() ||
    mimeType.split('/')[1] ||
    'file';

  const filename = `customized/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.${ext}`;

  const file = bucket.file(filename);

  await file.save(buffer, {
    metadata: { contentType: mimeType },
    public: true,
  });

  return `https://storage.googleapis.com/${bucket.name}/${filename}`;
}

// =====================
// CREATE CUSTOM ORDER
// =====================
router.post('/', verifyToken, async (req, res) => {
  try {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthenticated' });

    const user = await User.findOne({ uid });
    if (!user) return res.status(404).json({ error: 'User profile not found' });

    const { height, length, material, notes, images } = req.body;

    const uploadedUrls = [];
    if (Array.isArray(images)) {
      for (const img of images) {
        if (img?.base64?.startsWith('data:')) {
          const url = await uploadFileToFirebase(img.base64, img.originalName);
          if (url) uploadedUrls.push(url);
        }
      }
    }

    const order = await CustomizedOrder.create({
      uid,
      name: user.name,
      email: user.email,
      phone: user.phone,
      address: user.address,
      city: user.city,
      state: user.state,
      pincode: user.pincode,
      images: uploadedUrls,
      height: Number(height) || null,
      length: Number(length) || null,
      material,
      notes,
      price: null,
      payment: "COD",
      paymentStatus: "pending",
      status: "pending",
    });

    res.status(201).json({ success: true, order });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// =====================
// ADMIN – GET ALL
// =====================
router.get('/', verifyToken, async (req, res) => {
  const orders = await CustomizedOrder.find().sort({ createdAt: -1 });
  res.json(orders);
});

// =====================
// USER – GET OWN
// =====================
router.get('/my', verifyToken, async (req, res) => {
  const orders = await CustomizedOrder.find({ uid: req.user.uid }).sort({ createdAt: -1 });
  res.json(orders);
});

// =====================
// ADMIN – UPDATE + EMAIL
// =====================
router.patch('/:id', verifyToken, async (req, res) => {
  const { price, status, expectedDelivery } = req.body;

  try {
    const order = await CustomizedOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Not found' });

    const changes = [];

    if (price !== undefined && order.price !== Number(price)) {
      order.price = Number(price);
      changes.push(`Price updated to ₹${price}`);
    }

    if (status && order.status !== status) {
      order.status = status;
      changes.push(`Status changed to ${status}`);
    }

    if (expectedDelivery) {
      order.expectedDelivery = new Date(expectedDelivery);
      changes.push(`Expected delivery updated`);
    }

    await order.save();

    await Notification.create({
      uid: order.uid,
      title: "Custom Order Update",
      message: `Your custom order is now ₹${order.price || 'Not set'} – Status: ${order.status}`,
    });

    // =====================
    // SEND EMAIL VIA BREVO API
    // =====================
    if (order.email && changes.length > 0) {
      const statusText = {
        pending: "Pending",
        priced: "Priced (Quote Sent)",
        in_progress: "In Progress",
        completed: "Completed",
      }[order.status] || order.status;

      await transactionalApi.sendTransacEmail({
        sender: {
          name: "LayerLabs",
          email: process.env.EMAIL_FROM,
        },
        to: [{ email: order.email }],
        subject: `Update on Your Custom Order #${order._id.toString().slice(-6)}`,
        htmlContent: `
<!DOCTYPE html>
<html>
<body style="font-family:Arial">
  <h2>Custom Order Update</h2>
  <p>Hello <strong>${order.name}</strong>,</p>
  <p><strong>Status:</strong> ${statusText}</p>
  ${order.price ? `<p><strong>Price:</strong> ₹${order.price}</p>` : ''}
  <p>
    <a href="${FRONTEND_URL}/order-custom">View Order</a>
  </p>
</body>
</html>
        `,
      });

      console.log(`📧 Email sent to ${order.email}`);
    }

    res.json({ success: true, order });
  } catch (err) {
    console.error('Update/email error:', err);
    res.status(500).json({ error: 'Failed to update or send email' });
  }
});

// =====================
// CONFIRM PAYMENT
// =====================
router.patch('/:id/pay', verifyToken, async (req, res) => {
  try {
    const order = await CustomizedOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ error: "Not found" });

    order.payment = req.body.payment || "COD";
    order.paymentStatus = req.body.paymentStatus || "completed";
    order.status = "confirmed";

    await order.save();
    res.json({ success: true, order });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Payment update failed" });
  }
});

module.exports = router;
