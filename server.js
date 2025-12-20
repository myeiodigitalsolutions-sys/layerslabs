// backend/server.js (add near the top)
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const admin = require('firebase-admin');


const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: 'layerlabs-e738e.appspot.com',
  });
}

const bucket = admin.storage().bucket();


const customizedRoutes = require('./routes/customizedRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

const app = express();

app.use(cors());
app.use(express.json({ limit: '200mb' })); // Increased for base64 (was 50mb)
app.use(express.urlencoded({ extended: true, limit: '200mb' })); // Increased
// Routes
app.use('/api/categories', require('./routes/categoryRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use("/api/users", require('./routes/userRoutes'));
app.use('/api/customized', customizedRoutes);
app.use('/api/notifications', notificationRoutes);
app.use("/api/orders", require("./routes/orderRoutes"));
// In server.js
app.use("/api/cart", require("./routes/cartRoutes"));


// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/threeDModuleToys';

mongoose
  .connect(MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error', err));

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});