-- ============================================================
-- PromptStudio / PromptPhotos — Supabase Schema
-- Run this entire script in your Supabase SQL Editor.
-- Service-role key is used server-side, so RLS is disabled on
-- all tables (the server enforces auth, not Postgres policies).
-- ============================================================

-- 0. Users Table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT,
    name TEXT,
    picture TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- 1. Generations Table
CREATE TABLE IF NOT EXISTS generations (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id TEXT REFERENCES users(id),
    project_id BIGINT,
    idea TEXT,
    prompt_json TEXT,
    image_data TEXT,
    image_url TEXT,
    parent_id BIGINT,
    feedback TEXT,
    batch_id TEXT,
    selected_references TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE generations DISABLE ROW LEVEL SECURITY;

-- 2. Styles Table
CREATE TABLE IF NOT EXISTS styles (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id TEXT REFERENCES users(id),
    project_id BIGINT,
    name TEXT,
    style_json TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE styles DISABLE ROW LEVEL SECURITY;

-- 3. Palettes Table
CREATE TABLE IF NOT EXISTS palettes (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id TEXT REFERENCES users(id),
    project_id BIGINT,
    name TEXT,
    image_data TEXT,
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE palettes DISABLE ROW LEVEL SECURITY;

-- 4. References Table
CREATE TABLE IF NOT EXISTS references_images (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id TEXT REFERENCES users(id),
    project_id BIGINT,
    name TEXT,
    image_data TEXT,
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE references_images DISABLE ROW LEVEL SECURITY;

-- 5. Showcase Table
CREATE TABLE IF NOT EXISTS showcase (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id TEXT REFERENCES users(id),
    project_id BIGINT,
    type TEXT, -- 'generation', 'palette', 'reference'
    item_id BIGINT,
    starred BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE showcase DISABLE ROW LEVEL SECURITY;

-- 6. Comments Table
CREATE TABLE IF NOT EXISTS comments (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    showcase_id BIGINT REFERENCES showcase(id) ON DELETE CASCADE,
    text TEXT,
    author TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE comments DISABLE ROW LEVEL SECURITY;

-- 7. Project Settings Table
CREATE TABLE IF NOT EXISTS project_settings (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id TEXT REFERENCES users(id),
    name TEXT,
    brief TEXT,
    global_style TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE project_settings DISABLE ROW LEVEL SECURITY;

-- 8. Prompt Library Table
CREATE TABLE IF NOT EXISTS prompt_library (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id TEXT REFERENCES users(id),
    project_id BIGINT,
    category TEXT,
    title TEXT,
    prompt TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE prompt_library DISABLE ROW LEVEL SECURITY;

-- 9. Client Shares Table (Agency model — share a project showcase with a client via a token link)
CREATE TABLE IF NOT EXISTS client_shares (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    project_id BIGINT REFERENCES project_settings(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,          -- random slug used in the public URL
    label TEXT,                          -- e.g. "Acme Corp — Round 1"
    expires_at TIMESTAMP WITH TIME ZONE, -- NULL = never expires
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE client_shares DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- Storage bucket: promptphotos
-- Create this bucket manually in Supabase Storage dashboard:
--   Name: promptphotos
--   Public: true  (so image_url links work without auth)
-- ============================================================

