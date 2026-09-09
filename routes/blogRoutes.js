const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const combinedAdminAuth = require("../middlewares/adminAuthMiddleware");

const dataFilePath = path.join(__dirname, "../data/blogs.json");

// Helper: Read blogs from local JSON file
const readBlogs = () => {
  try {
    if (!fs.existsSync(dataFilePath)) return [];
    const data = fs.readFileSync(dataFilePath, "utf8");
    return JSON.parse(data);
  } catch (err) {
    console.error("Error reading blogs file:", err);
    return [];
  }
};

// Helper: Write blogs to local JSON file
const writeBlogs = (blogs) => {
  try {
    fs.writeFileSync(dataFilePath, JSON.stringify(blogs, null, 2), "utf8");
  } catch (err) {
    console.error("Error writing blogs file:", err);
  }
};

// Helper: Auto-slugify
const slugify = (text) => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w\-]+/g, "")
    .replace(/\-\-+/g, "-");
};

// ==========================================
// PUBLIC ROUTES
// ==========================================

// @route   GET /api/blogs
// @desc    Get all active blogs (supports category and search query)
// @access  Public
router.get("/", (req, res) => {
  try {
    const rawBlogs = readBlogs();
    let blogs = rawBlogs.filter((b) => b.isActive !== false);

    // Filter by Category
    if (req.query.category && req.query.category.toLowerCase() !== "all") {
      const targetCat = req.query.category.toLowerCase();
      blogs = blogs.filter((b) => b.category && b.category.toLowerCase() === targetCat);
    }

    // Filter by Search
    if (req.query.search) {
      const q = req.query.search.toLowerCase().trim();
      blogs = blogs.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          b.description.toLowerCase().includes(q) ||
          (b.tags && b.tags.some((t) => t.toLowerCase().includes(q)))
      );
    }

    // Sort by createdAt descending
    blogs.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    res.json(blogs);
  } catch (error) {
    console.error("Error fetching public blogs:", error);
    res.status(500).json({ message: "Server Error fetching blogs" });
  }
});

// @route   GET /api/blogs/:slug
// @desc    Get single blog by slug, legacyId, or id
// @access  Public
router.get("/:slug", (req, res) => {
  try {
    const blogs = readBlogs();
    const query = req.params.slug.trim().toLowerCase();

    const blog = blogs.find(
      (b) =>
        b.slug.toLowerCase() === query ||
        (b.legacyId && b.legacyId.toLowerCase() === query) ||
        (b.id && b.id.toString() === query) ||
        (b._id && b._id.toString() === query)
    );

    if (!blog) {
      return res.status(404).json({ message: "Blog not found" });
    }

    res.json(blog);
  } catch (error) {
    console.error("Error fetching single blog:", error);
    res.status(500).json({ message: "Server Error fetching blog" });
  }
});

// ==========================================
// ADMIN ROUTES (Protected with combinedAdminAuth)
// ==========================================

// @route   GET /api/blogs/admin/all
// @desc    Get all blogs (including drafts/inactive) for Admin Panel
// @access  Admin
router.get("/admin/all", combinedAdminAuth, (req, res) => {
  try {
    const blogs = readBlogs();
    blogs.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    res.json({
      success: true,
      total: blogs.length,
      blogs,
    });
  } catch (error) {
    console.error("Error fetching admin blogs:", error);
    res.status(500).json({ message: "Server Error fetching admin blogs" });
  }
});

// @route   POST /api/blogs
// @desc    Create a new blog and save into data/blogs.json
// @access  Admin
router.post("/", combinedAdminAuth, (req, res) => {
  try {
    const {
      title,
      slug,
      subtitle,
      description,
      category,
      coverImage,
      author,
      readTime,
      tags,
      featured,
      sections,
      keyTakeaways,
      isActive,
    } = req.body;

    if (!title || !description) {
      return res.status(400).json({ message: "Title and description are required." });
    }

    const blogs = readBlogs();

    // Generate unique slug
    let finalSlug = slug ? slugify(slug) : slugify(title);
    const slugExists = blogs.some((b) => b.slug === finalSlug);
    if (slugExists) {
      finalSlug = `${finalSlug}-${Date.now().toString().slice(-4)}`;
    }

    const nextId = blogs.length > 0 ? Math.max(...blogs.map((b) => b.id || 0)) + 1 : 1;

    const newBlog = {
      _id: `b_${Date.now()}`,
      id: nextId,
      slug: finalSlug,
      legacyId: `Blog${nextId}`,
      title: title.trim(),
      subtitle: subtitle ? subtitle.trim() : "",
      description: description.trim(),
      category: category || "Loans",
      coverImage:
        coverImage ||
        "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=1200&q=80",
      postedDate: new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      readTime: readTime || "5 min read",
      author: {
        name: (author && author.name) || "CoverMantra Editorial",
        role: (author && author.role) || "Financial Research & Advisory Desk",
        avatar: "/image/logo.png",
      },
      tags: Array.isArray(tags)
        ? tags
        : typeof tags === "string"
        ? tags.split(",").map((t) => t.trim()).filter(Boolean)
        : ["Finance"],
      featured: Boolean(featured),
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      createdAt: new Date().toISOString(),
      sections: Array.isArray(sections) && sections.length > 0
        ? sections
        : [
            {
              title: "Overview",
              type: "prose",
              paragraphs: [description],
            },
          ],
      keyTakeaways: Array.isArray(keyTakeaways) ? keyTakeaways : [],
    };

    blogs.unshift(newBlog); // Add to beginning
    writeBlogs(blogs);

    res.status(201).json({
      success: true,
      message: "Blog created successfully!",
      blog: newBlog,
    });
  } catch (error) {
    console.error("Error creating blog:", error);
    res.status(500).json({ message: "Server Error creating blog" });
  }
});

// @route   PUT /api/blogs/:id
// @desc    Update an existing blog in data/blogs.json
// @access  Admin
router.put("/:id", combinedAdminAuth, (req, res) => {
  try {
    const blogs = readBlogs();
    const targetId = req.params.id;

    const index = blogs.findIndex(
      (b) => b._id === targetId || b.id?.toString() === targetId || b.slug === targetId
    );

    if (index === -1) {
      return res.status(404).json({ message: "Blog not found to update" });
    }

    const existing = blogs[index];
    const updated = {
      ...existing,
      ...req.body,
      _id: existing._id,
      id: existing.id,
      updatedAt: new Date().toISOString(),
    };

    if (req.body.tags && typeof req.body.tags === "string") {
      updated.tags = req.body.tags.split(",").map((t) => t.trim()).filter(Boolean);
    }

    blogs[index] = updated;
    writeBlogs(blogs);

    res.json({
      success: true,
      message: "Blog updated successfully!",
      blog: updated,
    });
  } catch (error) {
    console.error("Error updating blog:", error);
    res.status(500).json({ message: "Server Error updating blog" });
  }
});

// @route   DELETE /api/blogs/:id
// @desc    Delete a blog from data/blogs.json
// @access  Admin
router.delete("/:id", combinedAdminAuth, (req, res) => {
  try {
    let blogs = readBlogs();
    const targetId = req.params.id;

    const exists = blogs.some(
      (b) => b._id === targetId || b.id?.toString() === targetId || b.slug === targetId
    );

    if (!exists) {
      return res.status(404).json({ message: "Blog not found to delete" });
    }

    blogs = blogs.filter(
      (b) => b._id !== targetId && b.id?.toString() !== targetId && b.slug !== targetId
    );

    writeBlogs(blogs);

    res.json({
      success: true,
      message: "Blog deleted successfully from blogs.json!",
    });
  } catch (error) {
    console.error("Error deleting blog:", error);
    res.status(500).json({ message: "Server Error deleting blog" });
  }
});

// @route   PATCH /api/blogs/:id/toggle
// @desc    Toggle blog active/draft status
// @access  Admin
router.patch("/:id/toggle", combinedAdminAuth, (req, res) => {
  try {
    const blogs = readBlogs();
    const targetId = req.params.id;

    const blog = blogs.find(
      (b) => b._id === targetId || b.id?.toString() === targetId || b.slug === targetId
    );

    if (!blog) {
      return res.status(404).json({ message: "Blog not found" });
    }

    blog.isActive = !blog.isActive;
    writeBlogs(blogs);

    res.json({
      success: true,
      message: `Blog status toggled to ${blog.isActive ? "Published" : "Draft"}`,
      isActive: blog.isActive,
    });
  } catch (error) {
    console.error("Error toggling blog status:", error);
    res.status(500).json({ message: "Server Error toggling status" });
  }
});

module.exports = router;
