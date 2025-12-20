// backend/config/firebaseAdmin.js

require('dotenv').config();
const admin = require('firebase-admin');

const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);

// Initialize Firebase Admin only if not already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: 'layerlabs-e738e.firebasestorage.app', // optional but recommended
  });
}

// Export the admin instance and the default bucket
const bucket = admin.storage().bucket();

module.exports = {
  admin,
  bucket,
};