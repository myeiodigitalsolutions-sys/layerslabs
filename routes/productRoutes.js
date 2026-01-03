// backend/routes/productRoutes.js
const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const admin = require('firebase-admin');

const bucket = admin.storage().bucket();

// Helper: Upload base64 image to Firebase Storage
async function uploadImageToFirebase(base64String) {
  if (!base64String) return null;

  const matches = base64String.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    throw new Error('Invalid base64 string');
  }

  const mimeType = matches[1];
  const base64Data = matches[2];
  const buffer = Buffer.from(base64Data, 'base64');
  const extension = mimeType.split('/')[1];
  const filename = `products/${Date.now()}-${Math.round(Math.random() * 1E9)}.${extension}`;
  const file = bucket.file(filename);

  await file.save(buffer, {
    metadata: { contentType: mimeType },
    public: true,
  });

  return `https://storage.googleapis.com/${bucket.name}/${filename}`;
}

// GET all products with category hierarchy
router.get('/', async (req, res) => {
  try {
    const { category, subcategory } = req.query;
    const filter = {};
    
    if (subcategory) {
      filter.subcategory = subcategory;
    } else if (category) {
      filter.category = category;
    }
    
    const products = await Product.find(filter)
      .sort({ createdAt: -1 })
      .populate('category', 'name')
      .populate('subcategory', 'name');
    res.json(products);
  } catch (err) {
    console.error('GET /api/products error', err);
    res.status(500).json({ message: 'Server error fetching products' });
  }
});

// GET products by category with subcategories
router.get('/by-category/:categoryId', async (req, res) => {
  try {
    const { categoryId } = req.params;
    
    // Get all subcategories of this category
    const Category = require('../models/Category');
    const subcategories = await Category.find({ parent: categoryId });
    const subcategoryIds = subcategories.map(sub => sub._id);
    
    // Find products in this category OR any of its subcategories
    const products = await Product.find({
      $or: [
        { category: categoryId },
        { subcategory: { $in: subcategoryIds } }
      ]
    })
    .populate('category', 'name')
    .populate('subcategory', 'name')
    .sort({ createdAt: -1 });
    
    res.json(products);
  } catch (err) {
    console.error('GET /api/products/by-category/:categoryId error', err);
    res.status(500).json({ message: 'Server error fetching products by category' });
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
    const product = await Product.findById(req.params.id)
      .populate('category', 'name')
      .populate('subcategory', 'name');
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
      description, features, category, subcategory,
      images, existingImages = []
    } = req.body;

    // Validate category/subcategory relationship
    if (subcategory && category) {
      const Category = require('../models/Category');
      const subCat = await Category.findById(subcategory);
      if (subCat && subCat.parent && subCat.parent.toString() !== category) {
        return res.status(400).json({ 
          message: 'Subcategory does not belong to the selected category' 
        });
      }
    }

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
            const url = await uploadImageToFirebase(base64);
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
      subcategory: subcategory || null,
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
      description, features, category, subcategory,
      images, existingImages = []
    } = req.body;

    // Validate category/subcategory relationship
    if (subcategory && category) {
      const Category = require('../models/Category');
      const subCat = await Category.findById(subcategory);
      if (subCat && subCat.parent && subCat.parent.toString() !== category) {
        return res.status(400).json({ 
          message: 'Subcategory does not belong to the selected category' 
        });
      }
    }

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
            const url = await uploadImageToFirebase(base64);
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
        subcategory: subcategory || null,
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
    res.json({ message: 'Product deleted successfully' });
  } catch (err) {
    console.error('DELETE /api/products/:id error', err);
    res.status(500).json({ message: 'Server error deleting product' });
  }
});

module.exports = router;