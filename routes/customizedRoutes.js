// routes/customizedRoutes.js
const express = require('express');
const router = express.Router();
const CustomizedOrder = require('../models/CustomizedOrder');
const Notification = require('../models/Notification');
const User = require('../models/User');
const verifyToken = require('../middleware/auth');
const nodemailer = require('nodemailer');
const admin = require('firebase-admin');

const bucket = admin.storage().bucket();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,  // This must be the App Password
  },
});

// Helper: Upload base64 file to Firebase Storage
async function uploadFileToFirebase(base64String, originalName) {
  if (!base64String) return null;

  // Extract mime type and buffer
  const matches = base64String.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    throw new Error('Invalid base64 string');
  }

  const mimeType = matches[1];
  const base64Data = matches[2];
  const buffer = Buffer.from(base64Data, 'base64');

  // Use original extension if provided, else from mime
  const ext = originalName ? originalName.split('.').pop() : mimeType.split('/')[1] || 'file';
  const uniquePrefix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const filename = `customized/${uniquePrefix}-${originalName || 'file'}.${ext}`;
  const file = bucket.file(filename);

  await file.save(buffer, {
    metadata: { contentType: mimeType },
    public: true, // Makes it publicly accessible
  });

  // Return public URL
  return `https://storage.googleapis.com/${bucket.name}/${filename}`;
}

// CREATE custom order
router.post('/', verifyToken, async (req, res) => {
  try {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthenticated' });

    const user = await User.findOne({ uid });
    if (!user) return res.status(404).json({ error: 'User profile not found' });

    const { height, length, material, notes, images } = req.body; // images: [{base64, originalName}]

    // Upload files
    const uploadedUrls = [];
    if (Array.isArray(images)) {
      for (const img of images) {
        if (img?.base64 && img.base64.startsWith('data:')) {
          try {
            const url = await uploadFileToFirebase(img.base64, img.originalName);
            if (url) uploadedUrls.push(url);
          } catch (uploadErr) {
            console.error('File upload failed:', uploadErr);
            // Continue with others
          }
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

// ADMIN – get all custom orders
router.get('/', verifyToken, async (req, res) => {
  const orders = await CustomizedOrder.find().sort({ createdAt: -1 });
  res.json(orders);
});

// USER – get own custom orders
router.get('/my', verifyToken, async (req, res) => {
  const orders = await CustomizedOrder.find({ uid: req.user.uid }).sort({ createdAt: -1 });
  res.json(orders);
});

// ADMIN – update custom order
router.patch('/:id', verifyToken, async (req, res) => {
  const { price, status, expectedDelivery } = req.body;

  try {
    const order = await CustomizedOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Not found' });

    // Track if anything changed
    const changes = [];
    if (price !== undefined && order.price !== Number(price)) {
      order.price = Number(price);
      changes.push(`Price updated to ₹${price}`);
    }
    if (status && order.status !== status) {
      order.status = status;
      changes.push(`Status changed to ${status.replace('_', ' ')}`);
    }
    if (expectedDelivery && (!order.expectedDelivery || new Date(order.expectedDelivery).toISOString().slice(0,10) !== expectedDelivery)) {
      order.expectedDelivery = new Date(expectedDelivery);
      changes.push(`Expected delivery: ${new Date(expectedDelivery).toLocaleDateString()}`);
    }

    await order.save();

    // Create in-app notification (existing)
    await Notification.create({
      uid: order.uid,
      title: "Custom Order Update",
      message: `Your custom order is now ₹${order.price || 'Not set'} – Status: ${order.status}`,
    });

    // === NEW: Send Email ===
   if (order.email && changes.length > 0) {
  const statusText = {
    pending: "Pending",
    priced: "Priced (Quote Sent)",
    in_progress: "In Progress",
    completed: "Completed"
  }[order.status] || order.status;

  const mailOptions = {
from: process.env.EMAIL_USER,  // or '"Your Shop Name" <myeiokln@gmail.com>'
  to: order.email,
  subject: `Update on Your Custom Order #${order._id.toString().slice(-6)}`,
    html: `
       <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Custom Order Update</title>
        <style>
          body { margin:0; padding:0; background:#f9f9f9; font-family:Arial,Helvetica,sans-serif; }
          .container { max-width:600px; margin:20px auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,.08); }
          .header { background:#c62828; color:#fff; padding:24px; text-align:center; }
          .header h1 { margin:0; font-size:24px; font-weight:600; }
          .content { padding:32px; }
          .card { background:#fff; border:1px solid #e0e0e0; border-radius:8px; padding:20px; }
          .card h2 { margin-top:0; color:#b71c1c; font-size:20px; }
          .card ul { list-style:none; padding:0; margin:16px 0; }
          .card li { margin-bottom:12px; font-size:16px; }
          .card li strong { color:#b71c1c; }
          .footer { background:#f5f5f5; padding:20px; text-align:center; font-size:13px; color:#666; }
          .btn { display:inline-block; margin-top:20px; padding:12px 24px; background:#c62828; color:#fff; text-decoration:none; border-radius:6px; font-weight:600; }
          @media (max-width:600px) {
            .container { margin:10px; }
            .content { padding:20px; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <!-- Header -->
          <div class="header">
            <h1>Custom Order Update</h1>
          </div>

          <!-- Body -->
          <div class="content">
            <p>Hello <strong>${order.name}</strong>,</p>
            <p>Your custom order has been updated. Here are the latest details:</p>

            <div class="card">
              <h2>Order Summary</h2>
              <ul>
                ${order.price ? `<li><strong>Price:</strong> ₹${order.price}</li>` : ''}
                <li><strong>Status:</strong> ${statusText}</li>
                <li><strong>Expected Delivery:</strong> ${
                  order.expectedDelivery
                    ? new Date(order.expectedDelivery).toLocaleDateString('en-IN', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })
                    : 'To be confirmed'
                }</li>
              </ul>
            </div>

            <p>We will keep you posted on any further progress.</p>
            <a href="http://localhost:3000/order-custom" class="btn">View Order</a>
          </div>

          <!-- Footer -->
          <div class="footer">
            <p>Thank you for choosing us!</p>
            <p style="margin:8px 0 0;">
              <small>Order ID: ${order._id.toString()}</small>
            </p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  await transporter.sendMail(mailOptions);
  console.log(`Email sent to ${order.email}`);
}

    res.json({ success: true, order });
  } catch (err) {
    console.error('Update or email error:', err);
    res.status(500).json({ error: 'Failed to update or send email' });
  }
});

// CONFIRM PAYMENT (COD / ONLINE)
router.patch('/:id/pay', verifyToken, async (req, res) => {
  try {
    const { payment, paymentStatus } = req.body;

    const order = await CustomizedOrder.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: "Custom order not found" });
    }

    order.payment = payment || "COD";
    order.paymentStatus = paymentStatus || "completed";
    order.status = "confirmed";

    await order.save();

    res.json({ success: true, order });
  } catch (err) {
    console.error("PAY ERROR:", err);
    res.status(500).json({ error: "Payment update failed" });
  }
});

module.exports = router;