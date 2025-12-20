// backend/routes/categoryRoutes.js
const express = require('express');
const router = express.Router();
const Category = require('../models/Category');

// GET all categories
router.get('/', async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    res.json(categories);
  } catch (err) {
    console.error('GET /api/categories error', err);
    res.status(500).json({ message: 'Server error fetching categories' });
  }
});

// POST create category (admin)
router.post('/', async (req, res) => {
  try {
    const { name, slug, description } = req.body;
    if (!name) return res.status(400).json({ message: 'Name is required' });

    const normalizedSlug = (slug || name)
      .toString()
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9\-]/g, '');

    const cat = new Category({
      name: name.trim(),
      slug: normalizedSlug,
      description,
    });

    const saved = await cat.save();
    res.status(201).json(saved);
  } catch (err) {
    console.error('POST /api/admin/categories error', err);
    if (err.code === 11000) {
      return res.status(400).json({ message: 'Category already exists' });
    }
    res.status(500).json({ message: 'Server error creating category' });
  }
});

// DELETE category (admin)
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Category.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Category not found' });

    // Unlink products from this category
    const Product = require('../models/Product');
    await Product.updateMany({ category: req.params.id }, { $set: { category: null } });

    res.json({ message: 'Category deleted' });
  } catch (err) {
    console.error('DELETE /api/admin/categories/:id error', err);
    res.status(500).json({ message: 'Server error deleting category' });
  }
});

module.exports = router;