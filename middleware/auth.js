require('dotenv').config();
const admin = require('firebase-admin');

let serviceAccount;

try {
  if (!process.env.FIREBASE_CREDENTIALS) {
    throw new Error('FIREBASE_CREDENTIALS not set');
  }

  // ✅ JSON string only (Render + local)
  serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
} catch (err) {
  console.error('🔥 FIREBASE SERVICE ACCOUNT LOAD ERROR:', err.message);
  throw err;
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

// 🔐 Auth middleware
module.exports = async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split('Bearer ')[1];

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.uid = decoded.uid;
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      error: 'Invalid or expired token',
      details: error.message,
    });
  }
};
