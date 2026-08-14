const express = require("express");
const router = express.Router();
const combinedAdminAuth = require("../middlewares/adminAuthMiddleware");
const fs = require('fs');
const path = require('path');

const dataFilePath = path.join(__dirname, '../data/lenders.json');

// Helper to read JSON
const readLenders = () => {
  try {
    if (!fs.existsSync(dataFilePath)) return [];
    const data = fs.readFileSync(dataFilePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error("Error reading lenders file:", err);
    return [];
  }
};

// Helper to write JSON
const writeLenders = (lenders) => {
  try {
    fs.writeFileSync(dataFilePath, JSON.stringify(lenders, null, 2), 'utf8');
  } catch (err) {
    console.error("Error writing lenders file:", err);
  }
};

// =======================
// PUBLIC ROUTES
// =======================

// @route   GET /api/lenders
// @desc    Get all active lenders sorted by priority (optional filtering by loanType / category)
// @access  Public
router.get("/", async (req, res) => {
  try {
    const rawLenders = readLenders();
    // Filter out inactive lenders for public view
    const lenders = rawLenders.filter(l => l.isActive !== false);
    
    lenders.sort((a, b) => (a.priority || 0) - (b.priority || 0));
    
    const filterVal = req.query.loanType || req.query.category;
    if (filterVal && filterVal.toLowerCase() !== "all") {
      const target = filterVal.toLowerCase();
      const filtered = lenders.filter(l => 
        l.loanTypes && 
        Array.isArray(l.loanTypes) && 
        l.loanTypes.some(type => type.toLowerCase() === target)
      );
      return res.json(filtered);
    }
    
    res.json(lenders);
  } catch (error) {
    console.error("Error fetching lenders:", error);
    res.status(500).json({ message: "Server Error" });
  }
});

// =======================
// ADMIN ROUTES
// =======================

// @route   GET /api/lenders/admin/all
// @desc    Get all lenders including inactive ones for Admin management
// @access  Admin
router.get("/admin/all", combinedAdminAuth, async (req, res) => {
  try {
    const lenders = readLenders();
    lenders.sort((a, b) => (a.priority || 0) - (b.priority || 0));
    res.json(lenders);
  } catch (error) {
    console.error("Error fetching all lenders for admin:", error);
    res.status(500).json({ message: "Server Error" });
  }
});

// @route   PUT /api/lenders/reorder
// @desc    Reorder lenders priority
// @access  Admin
router.put("/reorder", combinedAdminAuth, async (req, res) => {
  try {
    const { orderedIds } = req.body;
    if (!orderedIds || !Array.isArray(orderedIds)) {
      return res.status(400).json({ message: "Invalid data format." });
    }

    const lenders = readLenders();
    
    const updatedLenders = lenders.map(lender => {
      const index = orderedIds.indexOf(lender._id);
      if (index !== -1) {
        lender.priority = index + 1; // 1-based priority
      }
      return lender;
    });

    updatedLenders.sort((a, b) => (a.priority || 0) - (b.priority || 0));
    writeLenders(updatedLenders);

    res.json({ message: "Lenders reordered successfully", lenders: updatedLenders });
  } catch (error) {
    console.error("Error reordering lenders:", error);
    res.status(500).json({ message: "Server Error" });
  }
});

// @route   POST /api/lenders
// @desc    Add a new lender with full configuration
// @access  Admin
router.post("/", combinedAdminAuth, async (req, res) => {
  try {
    const { 
      name, 
      logo, 
      age, 
      minIncome, 
      pincodes, 
      UTM,
      approval,
      loanAmount,
      interestRate,
      processingFee,
      support,
      ratings,
      features,
      applyLink,
      loanTypes,
      isActive
    } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Lender name is required" });
    }

    const lenders = readLenders();
    
    let maxPriority = 0;
    lenders.forEach(l => {
      if (l.priority > maxPriority) maxPriority = l.priority;
    });

    // Helper to format arrays
    const parseArray = (val, fallback = []) => {
      if (Array.isArray(val)) return val;
      if (typeof val === 'string' && val.trim()) {
        return val.split(',').map(s => s.trim()).filter(Boolean);
      }
      return fallback;
    };
    
    const newLender = {
      _id: "l" + Date.now().toString(),
      name: name.trim(),
      logo: logo || "",
      age: Number(age) || 21,
      minIncome: Number(minIncome) || 15000,
      pincodes: parseArray(pincodes, ["*"]),
      UTM: UTM || "",
      approval: approval || "Good",
      loanAmount: loanAmount || "Up to ₹5,00,000",
      interestRate: interestRate || "Starting from 1.5% per month",
      processingFee: processingFee || "Starting from 2%",
      support: support || "24/7 customer support",
      ratings: Number(ratings) || 4.5,
      features: parseArray(features, ["Instant Approval", "Paperless Process", "Quick Disbursal"]),
      applyLink: applyLink || UTM || "",
      loanTypes: parseArray(loanTypes, ["instant", "personal"]),
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      priority: maxPriority + 1
    };

    lenders.push(newLender);
    writeLenders(lenders);
    
    res.status(201).json(newLender);
  } catch (error) {
    console.error("Error creating lender:", error);
    res.status(500).json({ message: "Server Error" });
  }
});

// @route   PUT /api/lenders/:id
// @desc    Update a lender
// @access  Admin
router.put("/:id", combinedAdminAuth, async (req, res) => {
  try {
    const lenders = readLenders();
    const index = lenders.findIndex(l => l._id === req.params.id);
    
    if (index !== -1) {
      const updates = { ...req.body };
      
      // Parse arrays if sent as strings
      if (typeof updates.pincodes === 'string') {
        updates.pincodes = updates.pincodes.split(',').map(s => s.trim()).filter(Boolean);
      }
      if (typeof updates.features === 'string') {
        updates.features = updates.features.split(',').map(s => s.trim()).filter(Boolean);
      }
      if (typeof updates.loanTypes === 'string') {
        updates.loanTypes = updates.loanTypes.split(',').map(s => s.trim()).filter(Boolean);
      }
      if (updates.age !== undefined) updates.age = Number(updates.age);
      if (updates.minIncome !== undefined) updates.minIncome = Number(updates.minIncome);
      if (updates.ratings !== undefined) updates.ratings = Number(updates.ratings);
      if (updates.isActive !== undefined) updates.isActive = Boolean(updates.isActive);

      lenders[index] = { ...lenders[index], ...updates };
      writeLenders(lenders);
      res.json(lenders[index]);
    } else {
      res.status(404).json({ message: "Lender not found" });
    }
  } catch (error) {
    console.error("Error updating lender:", error);
    res.status(500).json({ message: "Server Error" });
  }
});

// @route   DELETE /api/lenders/:id
// @desc    Delete a lender
// @access  Admin
router.delete("/:id", combinedAdminAuth, async (req, res) => {
  try {
    let lenders = readLenders();
    const exists = lenders.some(l => l._id === req.params.id);
    if (!exists) {
      return res.status(404).json({ message: "Lender not found" });
    }
    lenders = lenders.filter(l => l._id !== req.params.id);
    writeLenders(lenders);
    res.json({ message: "Lender deleted successfully" });
  } catch (error) {
    console.error("Error deleting lender:", error);
    res.status(500).json({ message: "Server Error" });
  }
});

module.exports = router;
