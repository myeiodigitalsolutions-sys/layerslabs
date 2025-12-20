// backend/routes/productRoutes.js
const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const admin = require('firebase-admin');

const bucket = admin.storage().bucket();

// Helper: Upload base64 image to Firebase Storage
async function uploadImageToFirebase(base64String, originalName) {
  if (!base64String) return null;

  // Extract mime type and buffer
  const matches = base64String.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    throw new Error('Invalid base64 string');
  }

  const mimeType = matches[1];
  const base64Data = matches[2];
  const buffer = Buffer.from(base64Data, 'base64');

  const extension = mimeType.split('/')[1]; // jpeg, png, etc.
  const filename = `products/${Date.now()}-${Math.round(Math.random() * 1E9)}.${extension}`;
  const file = bucket.file(filename);

  await file.save(buffer, {
    metadata: { contentType: mimeType },
    public: true, // Makes it publicly accessible
  });

  // Return public URL
  return `https://storage.googleapis.com/${bucket.name}/${filename}`;
}

// GET all products
router.get('/', async (req, res) => {
  try {
    const { category } = req.query;
    const filter = category ? { category } : {};
    const products = await Product.find(filter)
      .sort({ createdAt: -1 })
      .populate('category', 'name');
    res.json(products);
  } catch (err) {
    console.error('GET /api/products error', err);
    res.status(500).json({ message: 'Server error fetching products' });
  }
});

// GET search suggestions
router.get('/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json([]);

    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    const results = await Product.find({ name: { $regex: regex } })
      .limit(8)
      .select('name images')
      .lean();

    res.json(results);
  } catch (err) {
    console.error('GET /api/products/search error', err);
    res.status(500).json({ message: 'Server error searching products' });
  }
});

// GET single product
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate('category', 'name');
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
  } catch (err) {
    console.error('GET /api/products/:id error', err);
    res.status(500).json({ message: 'Server error fetching product' });
  }
});

// POST create product
router.post('/', async (req, res) => {
  try {
    const {
      name, price, rating, reviews, tag,
      description, features, category,
      images, // Now array of base64 strings
      existingImages = [] // URLs from Firebase (already uploaded)
    } = req.body;

    // Parse features
    const featuresArray = features
      ? features.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    // Parse existing images (sent as JSON string sometimes)
    let existingImageUrls = [];
    if (typeof existingImages === 'string') {
      try { existingImageUrls = JSON.parse(existingImages); } catch (e) {}
    } else if (Array.isArray(existingImages)) {
      existingImageUrls = existingImages;
    }

    // Upload new images
    const newImageUrls = [];
    if (Array.isArray(images)) {
      for (const base64 of images) {
        if (base64 && base64.startsWith('data:')) {
          try {
            const url = await uploadImageToFirebase(base64, 'product-image');
            if (url) newImageUrls.push(url);
          } catch (uploadErr) {
            console.error('Image upload failed:', uploadErr);
            // Continue with others
          }
        } else if (base64.startsWith('http')) {
          // In case old URLs sneak in
          newImageUrls.push(base64);
        }
      }
    }

    const allImages = [...existingImageUrls, ...newImageUrls];

    const product = new Product({
      name,
      price: Number(price),
      rating: Number(rating) || 0,
      reviews: Number(reviews) || 0,
      tag,
      description,
      features: featuresArray,
      images: allImages,
      category: category || null,
    });

    const saved = await product.save();
    res.status(201).json(saved);
  } catch (err) {
    console.error('POST /api/products error', err);
    res.status(500).json({ message: 'Server error creating product' });
  }
});

// PUT update product
router.put('/:id', async (req, res) => {
  try {
    const {
      name, price, rating, reviews, tag,
      description, features, category,
      images, // new base64 images
      existingImages = []
    } = req.body;

    const featuresArray = features
      ? features.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    let existingImageUrls = [];
    if (typeof existingImages === 'string') {
      try { existingImageUrls = JSON.parse(existingImages); } catch (e) {}
    } else if (Array.isArray(existingImages)) {
      existingImageUrls = existingImages;
    }

    const newImageUrls = [];
    if (Array.isArray(images)) {
      for (const base64 of images) {
        if (base64 && base64.startsWith('data:')) {
          try {
            const url = await uploadImageToFirebase(base64, 'product-image');
            if (url) newImageUrls.push(url);
          } catch (uploadErr) {
            console.error('Image upload failed:', uploadErr);
          }
        } else if (base64.startsWith('http')) {
          newImageUrls.push(base64);
        }
      }
    }

    const allImages = [...existingImageUrls, ...newImageUrls];

    const updated = await Product.findByIdAndUpdate(
      req.params.id,
      {
        name,
        price: Number(price),
        rating: Number(rating) || 0,
        reviews: Number(reviews) || 0,
        tag,
        description,
        features: featuresArray,
        images: allImages,
        category: category || null,
      },
      { new: true }
    );

    if (!updated) return res.status(404).json({ message: 'Product not found' });
    res.json(updated);
  } catch (err) {
    console.error('PUT /api/products/:id error', err);
    res.status(500).json({ message: 'Server error updating product' });
  }
});

// DELETE product
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Product.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Product not found' });

    // Optional: Delete images from Firebase Storage
    // You can extract filenames from URLs and delete them here

    res.json({ message: 'Product deleted successfully' });
  } catch (err) {
    console.error('DELETE /api/products/:id error', err);
    res.status(500).json({ message: 'Server error deleting product' });
  }
});

module.exports = router;