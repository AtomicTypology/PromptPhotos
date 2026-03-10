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

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  picture: string;
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
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.details || errorData.error || `Failed to save generation: ${res.status}`);
    }
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
  getLibrary: async (): Promise<PromptLibraryItem[]> => {
    const res = await fetch("/api/library");
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
  importLibrary: async (items: Omit<PromptLibraryItem, "id" | "created_at">[]): Promise<void> => {
    await fetch("/api/library/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
  },
  deleteLibraryItem: async (id: number): Promise<void> => {
    await fetch(`/api/library/${id}`, { method: "DELETE" });
  },
  globalSearch: async (query: string): Promise<{ generations: any[]; library: any[]; projects: any[] }> => {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    return res.json();
  },
  getProjectStats: async (): Promise<any[]> => {
    const res = await fetch("/api/projects/stats");
    return res.json();
  },
  rescueData: async (): Promise<any> => {
    const res = await fetch("/api/rescue");
    return res.json();
  },
  exportWorkspace: async (): Promise<any> => {
    const res = await fetch("/api/export");
    return res.json();
  },
  importWorkspace: async (data: any): Promise<void> => {
    const res = await fetch("/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Import failed");
  },
  purgeServer: async (): Promise<void> => {
    const res = await fetch("/api/purge", { method: "POST" });
    if (!res.ok) throw new Error("Purge failed");
  },
  getAuthUrl: async (): Promise<{ url: string }> => {
    const res = await fetch("/api/auth/url");
    return res.json();
  },
  getMe: async (): Promise<AuthUser | null> => {
    const res = await fetch("/api/me");
    return res.json();
  },
  logout: async (): Promise<void> => {
    await fetch("/api/logout", { method: "POST" });
  },
  syncToGCS: async (): Promise<void> => {
    const res = await fetch("/api/sync", { method: "POST" });
    if (!res.ok) throw new Error("Sync failed");
  },
  restoreFromGCS: async (): Promise<void> => {
    const res = await fetch("/api/restore", { method: "POST" });
    if (!res.ok) throw new Error("Restore failed");
  }
};
