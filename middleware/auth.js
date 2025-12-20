// middleware/auth.js
require('dotenv').config();
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

function loadServiceAccount() {
  const saPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (saPath) {
    const resolved = path.isAbsolute(saPath) ? saPath : path.join(process.cwd(), saPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`FIREBASE_SERVICE_ACCOUNT_PATH set but file not found: ${resolved}`);
    }
    const raw = fs.readFileSync(resolved, 'utf8');
    try {
      return JSON.parse(raw);
    } catch (err) {
      throw new Error(`Failed to parse JSON from service account file: ${err.message}`);
    }
  }

  const saEnv = process.env.FIREBASE_CREDENTIALS;
  if (!saEnv) {
    throw new Error('No FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT found in .env');
  }

  try {
    return JSON.parse(saEnv);
  } catch (err1) {
    try {
      const replaced = saEnv.replace(/\\n/g, '\n');
      return JSON.parse(replaced);
    } catch (err2) {
      throw new Error(
        `Failed to parse FIREBASE_SERVICE_ACCOUNT JSON. ` +
        `Tip: Use escaped \\n in private_key, or better — use FIREBASE_SERVICE_ACCOUNT_PATH pointing to a .json file.`
      );
    }
  }
}

let serviceAccount;
try {
  serviceAccount = loadServiceAccount();
} catch (err) {
  console.error('FIREBASE SERVICE ACCOUNT LOAD ERROR:', err.message);
  throw err; // Crash early — dev must fix credentials
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

// Middleware
module.exports = async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split('Bearer ')[1];

  try {
    const decoded = await admin.auth().verifyIdToken(token);

    // IMPORTANT: Set both for flexibility
    req.uid = decoded.uid;        // ← This is what your routes now expect
    req.user = decoded;           // ← Keep this too (contains email, name, etc.)

    // console.log('Token verified for UID:', req.uid); // Optional: helpful log

    next();
  } catch (error) {
    console.error('Token verification failed:', error.message);
    return res.status(401).json({ 
      error: 'Invalid or expired token',
      details: error.message 
    });
  }
};