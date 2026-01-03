// backend/routes/categoryRoutes.js
const express = require('express');
const router = express.Router();
const Category = require('../models/Category');

// Helper function to generate unique slug
async function generateUniqueSlug(baseSlug) {
  let slug = baseSlug;
  let counter = 1;
  
  // Check if slug exists
  while (await Category.findOne({ slug })) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
  
  return slug;
}

// Helper function to generate slug from name
function generateSlug(name) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/--+/g, '-')
    .trim();
}

// GET all categories with hierarchy (ordered)
router.get('/', async (req, res) => {
  try {
    const categories = await Category.find()
      .sort({ isMain: -1, order: 1, subcategoryOrder: 1, name: 1 })
      .lean();

    // Build hierarchy
    const mainCategories = categories.filter(c => c.isMain);
    const subCategories = categories.filter(c => !c.isMain);

    const hierarchy = mainCategories.map(mainCat => {
      const subs = subCategories.filter(sub => 
        sub.parent && sub.parent.toString() === mainCat._id.toString()
      ).sort((a, b) => a.subcategoryOrder - b.subcategoryOrder);
      
      return {
        ...mainCat,
        subcategories: subs
      };
    }).sort((a, b) => a.order - b.order);

    res.json({
      mainCategories: hierarchy,
      allCategories: categories,
    });
  } catch (err) {
    console.error('GET /api/categories error', err);
    res.status(500).json({ message: 'Server error fetching categories' });
  }
});

// GET main categories only (ordered)
router.get('/main', async (req, res) => {
  try {
    const mainCats = await Category.find({ isMain: true })
      .sort({ order: 1, name: 1 });
    res.json(mainCats);
  } catch (err) {
    console.error('GET /api/categories/main error', err);
    res.status(500).json({ message: 'Server error fetching main categories' });
  }
});

// GET subcategories by parent ID (ordered)
router.get('/sub/:parentId', async (req, res) => {
  try {
    const subCats = await Category.find({
      parent: req.params.parentId,
      isMain: false
    }).sort({ subcategoryOrder: 1, name: 1 });
    res.json(subCats);
  } catch (err) {
    console.error('GET /api/categories/sub/:parentId error', err);
    res.status(500).json({ message: 'Server error fetching subcategories' });
  }
});

// GET category by ID with children
router.get('/:id', async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ message: 'Category not found' });
    
    const subcategories = await Category.find({ parent: req.params.id })
      .sort({ subcategoryOrder: 1, name: 1 });
    
    res.json({
      ...category.toObject(),
      subcategories
    });
  } catch (err) {
    console.error('GET /api/categories/:id error', err);
    res.status(500).json({ message: 'Server error fetching category' });
  }
});

// POST create category (with bulk subcategories)
router.post('/', async (req, res) => {
  try {
    const { name, slug, description, isMain, parent, order, subcategoryOrder, subcategories } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Category name is required' });
    }
    
    // Validate parent if provided
    if (parent) {
      const parentExists = await Category.findById(parent);
      if (!parentExists) {
        return res.status(400).json({ message: 'Parent category not found' });
      }
    }
    
    // Generate unique slug
    const baseSlug = slug || generateSlug(name);
    const uniqueSlug = await generateUniqueSlug(baseSlug);
    
    const categoryData = {
      name: name.trim(),
      slug: uniqueSlug,
      description: description || '',
      parent: parent || null,
      isMain: isMain !== undefined ? isMain : true,
      order: order || 0,
      subcategoryOrder: subcategoryOrder || 0
    };
    
    const category = new Category(categoryData);
    const savedCategory = await category.save();
    
    // If creating main category with subcategories
    if (subcategories && Array.isArray(subcategories) && subcategories.length > 0 && categoryData.isMain) {
      const subPromises = subcategories.map(async (sub, index) => {
        if (!sub.name || !sub.name.trim()) return null;
        
        const subSlug = sub.slug || generateSlug(sub.name);
        const uniqueSubSlug = await generateUniqueSlug(subSlug);
        
        const subData = {
          name: sub.name.trim(),
          slug: uniqueSubSlug,
          description: sub.description || '',
          parent: savedCategory._id,
          isMain: false,
          subcategoryOrder: index
        };
        
        return new Category(subData).save();
      }).filter(promise => promise !== null);
      
      await Promise.all(subPromises);
    }
    
    res.status(201).json(savedCategory);
  } catch (err) {
    console.error('POST /api/categories error', err);
    if (err.code === 11000) {
      // Check which field caused the duplicate
      if (err.keyPattern && err.keyPattern.name) {
        // This should not happen if index is removed, but handle just in case
        res.status(400).json({ 
          message: 'A category with this name already exists. The name field should not have a unique constraint.' 
        });
      } else if (err.keyPattern && err.keyPattern.slug) {
        // This shouldn't happen with generateUniqueSlug, but handle just in case
        res.status(400).json({ 
          message: 'Slug already exists. Please try a different slug.' 
        });
      } else {
        res.status(400).json({ message: 'Duplicate key error' });
      }
    } else {
      res.status(500).json({ message: 'Server error creating category' });
    }
  }
});

// PUT update category
// PUT update category (with subcategory handling)
router.put('/:id', async (req, res) => {
  try {
    const { name, slug, description, parent, isMain, order, subcategoryOrder, subcategories } = req.body;
    
    // Prevent circular reference
    if (parent === req.params.id) {
      return res.status(400).json({ message: 'Category cannot be its own parent' });
    }
    
    // Check if slug is being updated and if it's unique
    if (slug) {
      const existingCategory = await Category.findOne({ 
        slug, 
        _id: { $ne: req.params.id } 
      });
      
      if (existingCategory) {
        return res.status(400).json({ message: 'Slug already exists' });
      }
    }
    
    const updateData = {
      name,
      description: description || '',
      parent: parent || null,
      isMain,
      order: order || 0,
      subcategoryOrder: subcategoryOrder || 0
    };
    
    // Only update slug if provided
    if (slug) {
      updateData.slug = slug;
    }
    
    const updated = await Category.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );
    
    if (!updated) return res.status(404).json({ message: 'Category not found' });
    
    // Handle subcategory updates if provided
    if (subcategories && Array.isArray(subcategories) && updated.isMain) {
      // First, get existing subcategories
      const existingSubs = await Category.find({ 
        parent: updated._id,
        isMain: false 
      });
      
      // Create/Update subcategories
      const subPromises = subcategories.map(async (sub, index) => {
        if (!sub.name || !sub.name.trim()) return null;
        
        if (sub._id) {
          // Update existing subcategory
          return Category.findByIdAndUpdate(
            sub._id,
            {
              name: sub.name.trim(),
              slug: sub.slug || generateSlug(sub.name),
              description: sub.description || '',
              subcategoryOrder: index
            },
            { new: true }
          );
        } else {
          // Create new subcategory
          const subSlug = sub.slug || generateSlug(sub.name);
          const uniqueSubSlug = await generateUniqueSlug(subSlug);
          
          const subData = {
            name: sub.name.trim(),
            slug: uniqueSubSlug,
            description: sub.description || '',
            parent: updated._id,
            isMain: false,
            subcategoryOrder: index
          };
          
          return new Category(subData).save();
        }
      }).filter(promise => promise !== null);
      
      await Promise.all(subPromises);
    }
    
    res.json(updated);
  } catch (err) {
    console.error('PUT /api/categories/:id error', err);
    if (err.code === 11000) {
      res.status(400).json({ message: 'Slug already exists' });
    } else {
      res.status(500).json({ message: 'Server error updating category' });
    }
  }
});

// PUT update category order (bulk update)
router.put('/update-order/bulk', async (req, res) => {
  try {
    const { categories } = req.body;
    
    if (!Array.isArray(categories)) {
      return res.status(400).json({ message: 'Categories array required' });
    }
    
    const bulkOps = categories.map(cat => ({
      updateOne: {
        filter: { _id: cat._id },
        update: { 
          order: cat.order || 0,
          subcategoryOrder: cat.subcategoryOrder || 0
        }
      }
    }));
    
    if (bulkOps.length > 0) {
      await Category.bulkWrite(bulkOps);
    }
    
    res.json({ message: 'Order updated successfully' });
  } catch (err) {
    console.error('PUT /api/categories/update-order/bulk error', err);
    res.status(500).json({ message: 'Server error updating order' });
  }
});


// POST add subcategory to existing category
router.post('/sub', async (req, res) => {
  try {
    const { name, slug, description, parent } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Subcategory name is required' });
    }
    
    if (!parent) {
      return res.status(400).json({ message: 'Parent category ID is required' });
    }
    
    // Check if parent exists and is a main category
    const parentCategory = await Category.findById(parent);
    if (!parentCategory) {
      return res.status(404).json({ message: 'Parent category not found' });
    }
    
    if (!parentCategory.isMain) {
      return res.status(400).json({ message: 'Parent must be a main category' });
    }
    
    // Generate unique slug
    const baseSlug = slug || generateSlug(name);
    const uniqueSlug = await generateUniqueSlug(baseSlug);
    
    // Get the next subcategory order
    const lastSubcategory = await Category.findOne({ 
      parent: parent,
      isMain: false 
    }).sort({ subcategoryOrder: -1 });
    
    const nextOrder = lastSubcategory ? lastSubcategory.subcategoryOrder + 1 : 0;
    
    const subcategory = new Category({
      name: name.trim(),
      slug: uniqueSlug,
      description: description || '',
      parent: parent,
      isMain: false,
      subcategoryOrder: nextOrder
    });
    
    const savedSubcategory = await subcategory.save();
    res.status(201).json(savedSubcategory);
  } catch (err) {
    console.error('POST /api/categories/sub error', err);
    if (err.code === 11000) {
      res.status(400).json({ message: 'Slug already exists' });
    } else {
      res.status(500).json({ message: 'Server error creating subcategory' });
    }
  }
});

// DELETE category
router.delete('/:id', async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ message: 'Category not found' });
    
    // If it's a main category, check if it has subcategories
    if (category.isMain) {
      const hasSubcategories = await Category.exists({ parent: req.params.id });
      if (hasSubcategories) {
        return res.status(400).json({ 
          message: 'Cannot delete main category with subcategories. Delete subcategories first.' 
        });
      }
    }
    
    // Check if category is used by products
    const Product = require('../models/Product');
    const usedInProducts = await Product.exists({ 
      $or: [
        { category: req.params.id },
        { subcategory: req.params.id }
      ]
    });
    
    if (usedInProducts) {
      return res.status(400).json({ 
        message: 'Cannot delete category that is used by products' 
      });
    }
    
    const deleted = await Category.findByIdAndDelete(req.params.id);
    
    res.json({ message: 'Category deleted successfully' });
  } catch (err) {
    console.error('DELETE /api/categories/:id error', err);
    res.status(500).json({ message: 'Server error deleting category' });
  }
});

// TEMPORARY: Fix index issue route
router.get('/fix-index', async (req, res) => {
  try {
    const collection = Category.collection;
    
    // List current indexes
    const indexes = await collection.indexes();
    console.log('Current indexes:', indexes);
    
    // Check if name_1 index exists and is unique
    const nameIndex = indexes.find(idx => idx.name === 'name_1');
    
    if (nameIndex && nameIndex.unique) {
      // Drop the unique index on name
      await collection.dropIndex('name_1');
      console.log('Dropped name_1 index');
      
      res.json({ 
        success: true, 
        message: 'Unique index on name field removed successfully.' 
      });
    } else {
      res.json({ 
        success: true, 
        message: 'No unique index found on name field. Indexes are already correct.' 
      });
    }
  } catch (err) {
    console.error('Error fixing indexes:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Error fixing indexes', 
      error: err.message 
    });
  }
});

module.exports = router;