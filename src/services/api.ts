export interface Generation {
  id: number;
  project_id: number;
  idea: string;
  prompt_json: string;
  image_data: string;
  parent_id?: number | null;
  feedback?: string | null;
  batch_id?: string | null;
  selected_references?: string | null; // JSON array of reference IDs
  created_at: string;
}

export interface PromptLibraryItem {
  id: number;
  project_id: number;
  category: string;
  title: string;
  prompt: string;
  created_at: string;
}

export interface StyleTemplate {
  id: number;
  project_id: number;
  name: string;
  style_json: string;
  created_at: string;
}

export interface Palette {
  id: number;
  project_id: number;
  name: string;
  image_data: string;
  created_at: string;
}

export interface ReferenceImage {
  id: number;
  project_id: number;
  name: string;
  image_data: string;
  created_at: string;
}

export interface ShowcaseItem {
  id: number;
  type: 'generation' | 'palette' | 'reference';
  item_id: number;
  starred: number;
  image_preview?: string;
  title: string;
  created_at: string;
}

export interface Comment {
  id: number;
  showcase_id: number;
  text: string;
  author: string;
  created_at: string;
}

export interface ProjectSettings {
  id: number;
  name: string;
  brief: string;
  global_style: string;
  updated_at: string;
}

export const api = {
  getProjects: async (): Promise<ProjectSettings[]> => {
    const res = await fetch("/api/projects");
    return res.json();
  },
  getProject: async (id: number): Promise<ProjectSettings> => {
    const res = await fetch(`/api/projects/${id}`);
    return res.json();
  },
  createProject: async (data: { name: string; brief: string; global_style: string }): Promise<{ id: number }> => {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return res.json();
  },
  updateProject: async (id: number, data: { name: string; brief: string; global_style: string }): Promise<void> => {
    await fetch(`/api/projects/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },
  getGenerations: async (projectId: number): Promise<Generation[]> => {
    const res = await fetch(`/api/generations?projectId=${projectId}`);
    return res.json();
  },
  saveGeneration: async (data: Omit<Generation, "id" | "created_at">): Promise<{ id: number }> => {
    const res = await fetch("/api/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return res.json();
  },
  deleteGeneration: async (id: number): Promise<void> => {
    await fetch(`/api/generations/${id}`, { method: "DELETE" });
  },
  getStyles: async (projectId: number): Promise<StyleTemplate[]> => {
    const res = await fetch(`/api/styles?projectId=${projectId}`);
    return res.json();
  },
  saveStyle: async (data: Omit<StyleTemplate, "id" | "created_at">): Promise<{ id: number }> => {
    const res = await fetch("/api/styles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return res.json();
  },
  // New Endpoints
  getPalettes: async (projectId: number): Promise<Palette[]> => {
    const res = await fetch(`/api/palettes?projectId=${projectId}`);
    return res.json();
  },
  savePalette: async (data: { name: string; image_data: string; project_id?: number }): Promise<{ id: number }> => {
    const res = await fetch("/api/palettes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return res.json();
  },
  getReferences: async (projectId: number): Promise<ReferenceImage[]> => {
    const res = await fetch(`/api/references?projectId=${projectId}`);
    return res.json();
  },
  saveReference: async (data: { name: string; image_data: string; project_id?: number }): Promise<{ id: number }> => {
    const res = await fetch("/api/references", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return res.json();
  },
  getShowcase: async (projectId: number): Promise<ShowcaseItem[]> => {
    const res = await fetch(`/api/showcase?projectId=${projectId}`);
    return res.json();
  },
  addToShowcase: async (data: { type: string; item_id: number; project_id: number }): Promise<{ id: number }> => {
    const res = await fetch("/api/showcase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return res.json();
  },
  toggleStar: async (id: number): Promise<void> => {
    await fetch(`/api/showcase/${id}/star`, { method: "POST" });
  },
  getComments: async (id: number): Promise<Comment[]> => {
    const res = await fetch(`/api/showcase/${id}/comments`);
    return res.json();
  },
  addComment: async (id: number, data: { text: string; author: string }): Promise<{ id: number }> => {
    const res = await fetch(`/api/showcase/${id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return res.json();
  },
  // Prompt Library
  getLibrary: async (projectId: number): Promise<PromptLibraryItem[]> => {
    const res = await fetch(`/api/library?projectId=${projectId}`);
    return res.json();
  },
  saveLibraryItem: async (data: Omit<PromptLibraryItem, "id" | "created_at">): Promise<{ id: number }> => {
    const res = await fetch("/api/library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return res.json();
  },
  importLibrary: async (items: Omit<PromptLibraryItem, "id" | "created_at">[], project_id?: number): Promise<void> => {
    await fetch("/api/library/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, project_id }),
    });
  },
  deleteLibraryItem: async (id: number): Promise<void> => {
    await fetch(`/api/library/${id}`, { method: "DELETE" });
  }
};
