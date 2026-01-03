// backend/models/Category.js
const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String },
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
    },
    isMain: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
    subcategoryOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Ensure slug uniqueness only (not name)
categorySchema.index({ slug: 1 }, { unique: true });

module.exports = mongoose.model('Category', categorySchema);