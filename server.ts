import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("promptstudio.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS generations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER DEFAULT 1,
    idea TEXT,
    prompt_json TEXT,
    image_data TEXT,
    parent_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS styles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER DEFAULT 1,
    name TEXT,
    style_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS palettes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER DEFAULT 1,
    name TEXT,
    image_data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS references_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER DEFAULT 1,
    name TEXT,
    image_data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS showcase (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER DEFAULT 1,
    type TEXT, -- 'generation', 'palette', 'reference'
    item_id INTEGER,
    starred INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    showcase_id INTEGER,
    text TEXT,
    author TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS project_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    brief TEXT,
    global_style TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS prompt_library (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER DEFAULT 1,
    category TEXT,
    title TEXT,
    prompt TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  INSERT OR IGNORE INTO project_settings (id, name, brief, global_style) 
  VALUES (1, 'Main Workspace', 'Your primary creative environment.', 'Modern, Clean, Minimalist');
`);

try {
  db.prepare("ALTER TABLE palettes ADD COLUMN project_id INTEGER DEFAULT 1").run();
} catch (e) {}

try {
  db.prepare("ALTER TABLE references_images ADD COLUMN project_id INTEGER DEFAULT 1").run();
} catch (e) {}

try {
  db.prepare("ALTER TABLE generations ADD COLUMN project_id INTEGER DEFAULT 1").run();
} catch (e) {}

try {
  db.prepare("ALTER TABLE generations ADD COLUMN feedback TEXT").run();
} catch (e) {}
try {
  db.prepare("ALTER TABLE generations ADD COLUMN batch_id TEXT").run();
} catch (e) {}
try {
  db.prepare("ALTER TABLE generations ADD COLUMN selected_references TEXT").run();
} catch (e) {}

try {
  db.prepare("ALTER TABLE palettes ADD COLUMN image_data TEXT").run();
} catch (e) {}

try {
  db.prepare("ALTER TABLE generations ADD COLUMN parent_id INTEGER").run();
} catch (e) {}

try {
  db.prepare("ALTER TABLE showcase ADD COLUMN project_id INTEGER DEFAULT 1").run();
} catch (e) {}

try {
  db.prepare("ALTER TABLE styles ADD COLUMN project_id INTEGER DEFAULT 1").run();
} catch (e) {}

try {
  db.prepare("ALTER TABLE prompt_library ADD COLUMN project_id INTEGER DEFAULT 1").run();
} catch (e) {}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // API Routes
  app.get("/api/generations", (req, res) => {
    const projectId = req.query.projectId || 1;
    const rows = db.prepare("SELECT * FROM generations WHERE project_id = ? ORDER BY created_at DESC").all(projectId);
    res.json(rows);
  });

  app.post("/api/generations", (req, res) => {
    const { idea, prompt_json, image_data, parent_id, project_id, feedback, batch_id, selected_references } = req.body;
    const info = db.prepare(
      "INSERT INTO generations (idea, prompt_json, image_data, parent_id, project_id, feedback, batch_id, selected_references) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(idea, prompt_json, image_data, parent_id || null, project_id || 1, feedback || null, batch_id || null, selected_references || null);
    res.json({ id: info.lastInsertRowid });
  });

  app.get("/api/styles", (req, res) => {
    const projectId = req.query.projectId || 1;
    const rows = db.prepare("SELECT * FROM styles WHERE project_id = ? ORDER BY created_at DESC").all(projectId);
    res.json(rows);
  });

  app.post("/api/styles", (req, res) => {
    const { name, style_json, project_id } = req.body;
    const info = db.prepare(
      "INSERT INTO styles (name, style_json, project_id) VALUES (?, ?, ?)"
    ).run(name, style_json, project_id || 1);
    res.json({ id: info.lastInsertRowid });
  });

  // Palettes
  app.get("/api/palettes", (req, res) => {
    try {
      const projectId = req.query.projectId || 1;
      const rows = db.prepare("SELECT * FROM palettes WHERE project_id = ? ORDER BY created_at DESC").all(projectId);
      res.json(rows);
    } catch (error) {
      console.error("Error fetching palettes:", error);
      res.status(500).json({ error: "Failed to fetch palettes" });
    }
  });

  app.post("/api/palettes", (req, res) => {
    try {
      const { name, image_data, project_id } = req.body;
      const info = db.prepare("INSERT INTO palettes (name, image_data, project_id) VALUES (?, ?, ?)").run(name, image_data, project_id || 1);
      res.json({ id: info.lastInsertRowid });
    } catch (error) {
      console.error("Error saving palette:", error);
      res.status(500).json({ error: "Failed to save palette" });
    }
  });

  // References
  app.get("/api/references", (req, res) => {
    try {
      const projectId = req.query.projectId || 1;
      const rows = db.prepare("SELECT * FROM references_images WHERE project_id = ? ORDER BY created_at DESC").all(projectId);
      res.json(rows);
    } catch (error) {
      console.error("Error fetching references:", error);
      res.status(500).json({ error: "Failed to fetch references" });
    }
  });

  app.post("/api/references", (req, res) => {
    try {
      const { name, image_data, project_id } = req.body;
      const info = db.prepare("INSERT INTO references_images (name, image_data, project_id) VALUES (?, ?, ?)").run(name, image_data, project_id || 1);
      res.json({ id: info.lastInsertRowid });
    } catch (error) {
      console.error("Error saving reference:", error);
      res.status(500).json({ error: "Failed to save reference" });
    }
  });

  // Showcase
  app.get("/api/showcase", (req, res) => {
    try {
      const projectId = req.query.projectId || 1;
      const rows = db.prepare(`
        SELECT s.*, 
               CASE 
                 WHEN s.type = 'generation' THEN g.image_data
                 WHEN s.type = 'reference' THEN r.image_data
                 WHEN s.type = 'palette' THEN p.image_data
                 ELSE NULL 
               END as image_preview,
               CASE 
                 WHEN s.type = 'generation' THEN g.idea
                 WHEN s.type = 'reference' THEN r.name
                 WHEN s.type = 'palette' THEN p.name
               END as title
        FROM showcase s
        LEFT JOIN generations g ON s.type = 'generation' AND s.item_id = g.id
        LEFT JOIN references_images r ON s.type = 'reference' AND s.item_id = r.id
        LEFT JOIN palettes p ON s.type = 'palette' AND s.item_id = p.id
        WHERE s.project_id = ?
        ORDER BY s.created_at DESC
      `).all(projectId);
      res.json(rows);
    } catch (error) {
      console.error("Error fetching showcase:", error);
      res.status(500).json({ error: "Failed to fetch showcase" });
    }
  });

  app.post("/api/showcase", (req, res) => {
    const { type, item_id, project_id } = req.body;
    const info = db.prepare("INSERT INTO showcase (type, item_id, project_id) VALUES (?, ?, ?)").run(type, item_id, project_id || 1);
    res.json({ id: info.lastInsertRowid });
  });

  app.post("/api/showcase/:id/star", (req, res) => {
    db.prepare("UPDATE showcase SET starred = 1 - starred WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Comments
  app.get("/api/showcase/:id/comments", (req, res) => {
    const rows = db.prepare("SELECT * FROM comments WHERE showcase_id = ? ORDER BY created_at ASC").all(req.params.id);
    res.json(rows);
  });

  app.post("/api/showcase/:id/comments", (req, res) => {
    try {
      const { text, author } = req.body;
      const info = db.prepare("INSERT INTO comments (showcase_id, text, author) VALUES (?, ?, ?)").run(req.params.id, text, author);
      res.json({ id: info.lastInsertRowid });
    } catch (error) {
      console.error("Error adding comment:", error);
      res.status(500).json({ error: "Failed to add comment" });
    }
  });

  // Project Settings
  app.get("/api/projects", (req, res) => {
    try {
      const rows = db.prepare("SELECT * FROM project_settings ORDER BY updated_at DESC").all();
      res.json(rows);
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ error: "Failed to fetch projects" });
    }
  });

  app.get("/api/projects/:id", (req, res) => {
    try {
      const row = db.prepare("SELECT * FROM project_settings WHERE id = ?").get(req.params.id);
      res.json(row);
    } catch (error) {
      console.error("Error fetching project settings:", error);
      res.status(500).json({ error: "Failed to fetch project settings" });
    }
  });

  app.post("/api/projects", (req, res) => {
    try {
      const { name, brief, global_style } = req.body;
      const info = db.prepare("INSERT INTO project_settings (name, brief, global_style) VALUES (?, ?, ?)")
        .run(name || 'New Project', brief || '', global_style || '');
      res.json({ id: info.lastInsertRowid });
    } catch (error) {
      console.error("Error creating project:", error);
      res.status(500).json({ error: "Failed to create project" });
    }
  });

  app.post("/api/projects/:id", (req, res) => {
    try {
      const { name, brief, global_style } = req.body;
      db.prepare("UPDATE project_settings SET name = ?, brief = ?, global_style = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(name, brief, global_style, req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating project settings:", error);
      res.status(500).json({ error: "Failed to update project settings" });
    }
  });

  app.delete("/api/generations/:id", (req, res) => {
    db.prepare("DELETE FROM generations WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Prompt Library
  app.get("/api/library", (req, res) => {
    const projectId = req.query.projectId || 1;
    const rows = db.prepare("SELECT * FROM prompt_library WHERE project_id = ? ORDER BY category ASC, title ASC").all(projectId);
    res.json(rows);
  });

  app.post("/api/library", (req, res) => {
    const { category, title, prompt, project_id } = req.body;
    const info = db.prepare("INSERT INTO prompt_library (category, title, prompt, project_id) VALUES (?, ?, ?, ?)")
      .run(category, title, prompt, project_id || 1);
    res.json({ id: info.lastInsertRowid });
  });

  app.post("/api/library/import", (req, res) => {
    const { items, project_id } = req.body;
    const insert = db.prepare("INSERT INTO prompt_library (category, title, prompt, project_id) VALUES (?, ?, ?, ?)");
    const transaction = db.transaction((items) => {
      for (const item of items) {
        insert.run(item.category, item.title, item.prompt, project_id || 1);
      }
    });
    transaction(items);
    res.json({ success: true });
  });

  app.delete("/api/library/:id", (req, res) => {
    db.prepare("DELETE FROM prompt_library WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
