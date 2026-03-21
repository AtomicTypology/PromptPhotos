import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, 
  Image as ImageIcon, 
  History, 
  Save, 
  Trash2, 
  Copy, 
  Plus,
  Palette,
  Star,
  MessageSquare,
  Upload,
  FolderHeart,
  X,
  Send,
  ChevronRight,
  Eye,
  EyeOff,
  LayoutGrid,
  Layers,
  Library,
  GitBranch,
  Search,
  FileText,
  Wand2,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  LifeBuoy,
  Database,
  Download,
  RefreshCw,
  ShieldCheck,
  Cloud,
  CloudUpload,
  CloudDownload,
  LogOut,
  User
} from 'lucide-react';
import { get, set } from 'idb-keyval';
import { generateStructuredPrompt, generateImage, StructuredPrompt, generateMoodboard, Moodboard, critiqueImage, Critique } from './services/gemini';
import { api, Generation, StyleTemplate, Palette as PaletteType, ReferenceImage, ShowcaseItem, Comment, ProjectSettings, PromptLibraryItem, AuthUser } from './services/api';
import { LandingPage } from './components/LandingPage';

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'generate' | 'archive' | 'moodboard' | 'showcase' | 'library' | 'project'>('dashboard');
  const [idea, setIdea] = useState('');
  const [parentGeneration, setParentGeneration] = useState<Generation | null>(null);
  const [structuredPrompt, setStructuredPrompt] = useState<StructuredPrompt | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  
  const [history, setHistory] = useState<Generation[]>([]);
  const [palettes, setPalettes] = useState<PaletteType[]>([]);
  const [references, setReferences] = useState<ReferenceImage[]>([]);
  const [showcase, setShowcase] = useState<ShowcaseItem[]>([]);
  const [library, setLibrary] = useState<PromptLibraryItem[]>([]);
  const [projects, setProjects] = useState<ProjectSettings[]>([]);
  const [projectStats, setProjectStats] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ generations: any[]; library: any[]; projects: any[] } | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isRescuing, setIsRescuing] = useState(false);
  const [rescueResult, setRescueResult] = useState<any>(null);
  const [browserBackupCount, setBrowserBackupCount] = useState(0);
  const [showBackupSuggestion, setShowBackupSuggestion] = useState(false);

  // Browser Backup Logic
  const backupGenerationLocally = async (gen: Generation) => {
    try {
      const existing: Generation[] = await get('browser_generations') || [];
      // Keep last 100 generations in browser to avoid filling up storage
      const updated = [gen, ...existing].slice(0, 100);
      await set('browser_generations', updated);
      setBrowserBackupCount(updated.length);
    } catch (err) {
      console.error('Failed to save browser backup:', err);
    }
  };

  const restoreFromBrowser = async () => {
    setIsRescuing(true);
    try {
      const backup: Generation[] = await get('browser_generations') || [];
      if (backup.length === 0) {
        alert('No browser backup found.');
        return;
      }

      let restoredCount = 0;
      for (const gen of backup) {
        try {
          await api.saveGeneration({
            idea: gen.idea,
            prompt_json: gen.prompt_json,
            image_data: gen.image_data,
            parent_id: null, // Reset lineage to avoid foreign key issues
            project_id: currentProjectId,
            feedback: gen.feedback,
            batch_id: gen.batch_id,
            selected_references: gen.selected_references
          });
          restoredCount++;
        } catch (e) {
          console.error('Failed to restore individual generation:', e);
        }
      }
      
      alert(`Successfully restored ${restoredCount} images from your browser's local storage.`);
      await loadData();
    } catch (err) {
      console.error('Restore failed:', err);
      alert('Failed to restore from browser.');
    } finally {
      setIsRescuing(false);
    }
  };

  useEffect(() => {
    const checkBackup = async () => {
      const backup: Generation[] = await get('browser_generations') || [];
      setBrowserBackupCount(backup.length);
    };
    checkBackup();
  }, []);
  const [showDebug, setShowDebug] = useState(false);
  const [beachArtFound, setBeachArtFound] = useState<any>(null);
  const [currentProjectId, setCurrentProjectId] = useState<number>(() => {
    const saved = localStorage.getItem('promptstudio_current_project_id');
    return saved ? Number(saved) : 1;
  });

  useEffect(() => {
    localStorage.setItem('promptstudio_current_project_id', currentProjectId.toString());
  }, [currentProjectId]);
  const [project, setProject] = useState<ProjectSettings | null>(null);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
  const [editProjectName, setEditProjectName] = useState('');

  const [isGeneratingMoodboard, setIsGeneratingMoodboard] = useState(false);
  const [vibeInput, setVibeInput] = useState('');
  
  const [isCritiquing, setIsCritiquing] = useState(false);
  const [critiqueResult, setCritiqueResult] = useState<Critique | null>(null);
  const [selectedForCritique, setSelectedForCritique] = useState<Generation | null>(null);
  
  const [selectedReferences, setSelectedReferences] = useState<number[]>([]);
  const [batchResults, setBatchResults] = useState<Generation[]>([]);
  const [feedback, setFeedback] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  
  const [selectedShowcaseItem, setSelectedShowcaseItem] = useState<ShowcaseItem | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [authorName, setAuthorName] = useState('Creative Director');

  const refUploadRef = useRef<HTMLInputElement>(null);
  const paletteUploadRef = useRef<HTMLInputElement>(null);
  const csvUploadRef = useRef<HTMLInputElement>(null);

  const [hasSelectedKey, setHasSelectedKey] = useState(true);

  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio?.hasSelectedApiKey) {
        const has = await window.aistudio.hasSelectedApiKey();
        setHasSelectedKey(has);
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      setHasSelectedKey(true);
    }
  };

  const [autoDevelop, setAutoDevelop] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const userData = await api.getMe();
        setUser(userData);
      } catch (error) {
        console.error("Failed to fetch user:", error);
      }
    };
    fetchUser();
  }, []);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const { url } = await api.getAuthUrl();
      const authWindow = window.open(url, 'google_oauth', 'width=600,height=700');
      
      if (!authWindow) {
        alert('Please allow popups to sign in with Google');
        return;
      }

      const handleMessage = async (event: MessageEvent) => {
        if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
          const userData = await api.getMe();
          setUser(userData);
          window.removeEventListener('message', handleMessage);
          loadInitialData();
        }
      };
      window.addEventListener('message', handleMessage);
    } catch (error) {
      console.error("Login failed:", error);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await api.logout();
      setUser(null);
      loadInitialData();
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const [isSyncing, setIsSyncing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const handleSyncToGCS = async () => {
    if (!user) return;
    setIsSyncing(true);
    try {
      await api.syncToGCS();
      alert("Workspace successfully synced to Google Cloud Storage!");
    } catch (error) {
      console.error("Sync failed:", error);
      alert("Failed to sync to Google Cloud. Please check your configuration.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRestoreFromGCS = async () => {
    if (!user) return;
    if (!confirm("This will overwrite your current local workspace with the backup from Google Cloud. Proceed?")) return;
    
    setIsRestoring(true);
    try {
      await api.restoreFromGCS();
      alert("Workspace successfully restored from Google Cloud!");
      window.location.reload();
    } catch (error) {
      console.error("Restore failed:", error);
      alert("Failed to restore from Google Cloud. No backup found or configuration error.");
    } finally {
      setIsRestoring(false);
    }
  };

  useEffect(() => {
    loadInitialData();
    checkBrowserBackup();
  }, []);

  useEffect(() => {
    if (currentProjectId) {
      loadProjectData(currentProjectId);
    }
  }, [currentProjectId]);

  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [hasBrowserBackup, setHasBrowserBackup] = useState(false);
  const [lastBackupDate, setLastBackupDate] = useState<string | null>(null);
  const [storageMode, setStorageMode] = useState<'local' | 'cloud'>(() => {
    const saved = localStorage.getItem('promptstudio_storage_mode');
    return (saved as any) || 'local';
  });

  const toggleStorageMode = () => {
    const newMode = storageMode === 'local' ? 'cloud' : 'local';
    setStorageMode(newMode);
    localStorage.setItem('promptstudio_storage_mode', newMode);
    alert(`Storage mode switched to ${newMode.toUpperCase()}. ${newMode === 'local' ? 'Data will now stay in your browser.' : 'Data will sync to the server database.'}`);
  };

  const purgeServerCache = async () => {
    if (confirm("PRIVACY ALERT: This will permanently delete all projects and history from the cloud server. Your browser backup will remain safe. Proceed?")) {
      try {
        await api.purgeServer();
        alert("Server database purged. Your workspace is now local-only.");
        window.location.reload();
      } catch (error) {
        alert("Failed to purge server.");
      }
    }
  };

  const saveToBrowserBackup = async () => {
    try {
      const data = await api.exportWorkspace();
      await set('promptstudio_workspace_backup', data);
      await set('promptstudio_backup_date', new Date().toISOString());
      setLastBackupDate(new Date().toISOString());
      setHasBrowserBackup(true);
      console.log("Browser backup updated.");
    } catch (error) {
      console.error("Failed to save browser backup:", error);
    }
  };

  const checkBrowserBackup = async () => {
    try {
      const backup = await get('promptstudio_workspace_backup');
      const date = await get('promptstudio_backup_date');
      if (backup && date) {
        setHasBrowserBackup(true);
        setLastBackupDate(date);
        
        // If the current database is essentially empty (only 1 project with default name), 
        // offer to restore the backup automatically.
        const stats = await api.getProjectStats();
        const totalGenerations = stats.reduce((acc, s) => acc + (s.generation_count || 0), 0);
        
        if (totalGenerations === 0 && stats.length <= 1) {
          if (confirm(`Welcome back! We found a local backup from ${new Date(date).toLocaleString()}. Would you like to restore your workspace?`)) {
            await api.importWorkspace(backup);
            window.location.reload();
          }
        }
      }
    } catch (error) {
      console.error("Failed to check browser backup:", error);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const data = await api.exportWorkspace();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `promptstudio-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      alert('Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm("This will overwrite all current data in your workspace. Are you sure?")) return;

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        await api.importWorkspace(data);
        alert('Workspace restored successfully!');
        window.location.reload();
      } catch (error) {
        console.error(error);
        alert('Import failed. Please check the file format.');
      } finally {
        setIsImporting(false);
      }
    };
    reader.readAsText(file);
  };

  const loadInitialData = async () => {
    const [projs, stats] = await Promise.all([
      api.getProjects(),
      api.getProjectStats()
    ]);
    setProjects(projs);
    setProjectStats(stats);
    
    // Check for beach art specifically to answer user
    const beachResults = await api.globalSearch('beach');
    if (beachResults.generations.length > 0 || beachResults.library.length > 0) {
      setBeachArtFound(beachResults);
    }
    
    const savedId = localStorage.getItem('promptstudio_current_project_id');
    if (savedId) {
      const id = Number(savedId);
      if (projs.some(p => p.id === id)) {
        setCurrentProjectId(id);
        loadProjectData(id); // Force load even if ID didn't change
        return;
      }
    }

    if (projs.length > 0) {
      setCurrentProjectId(projs[0].id);
      const initialGens = await api.getGenerations(projs[0].id);
      
      // If server is empty but browser has backup, suggest rescue
      const backup: Generation[] = await get('browser_generations') || [];
      if (initialGens.length === 0 && backup.length > 0) {
        setShowBackupSuggestion(true);
      }
      
      loadProjectData(projs[0].id);
    }
  };

  const loadProjectData = async (projectId: number) => {
    const [h, p, r, s, proj, lib, st] = await Promise.all([
      api.getGenerations(projectId),
      api.getPalettes(projectId),
      api.getReferences(projectId),
      api.getShowcase(projectId),
      api.getProject(projectId),
      api.getLibrary(),
      api.getStyles(projectId)
    ]);
    setHistory(h);
    setPalettes(p);
    setReferences(r);
    setShowcase(s);
    setProject(proj);
    setLibrary(lib);
  };

  const loadData = async () => {
    await loadInitialData();
    if (currentProjectId) {
      await loadProjectData(currentProjectId);
    }
    // After any data load, update the browser backup
    saveToBrowserBackup();
  };

  const handleUpdateProject = async () => {
    if (!project) return;
    setIsSavingProject(true);
    try {
      await api.updateProject(project.id, {
        name: project.name,
        brief: project.brief,
        global_style: project.global_style
      });
      loadInitialData();
    } catch (error) {
      console.error(error);
    } finally {
      setIsSavingProject(false);
    }
  };

  const handleRenameProject = async (id: number) => {
    if (!editProjectName.trim()) return;
    try {
      const p = projects.find(proj => proj.id === id);
      if (!p) return;
      await api.updateProject(id, {
        ...p,
        name: editProjectName
      });
      setEditingProjectId(null);
      loadInitialData();
    } catch (error) {
      console.error(error);
    }
  };

  const handleCreateProject = async () => {
    setIsCreatingProject(true);
    try {
      const res = await api.createProject({
        name: 'New Project',
        brief: 'Define your project brief here...',
        global_style: 'Modern, Clean, Minimalist'
      });
      await loadInitialData();
      setCurrentProjectId(res.id);
      setActiveTab('project');
    } catch (error) {
      console.error(error);
    } finally {
      setIsCreatingProject(false);
    }
  };

  const handleGeneratePrompt = async () => {
    if (!idea.trim()) return;
    setIsGeneratingPrompt(true);
    try {
      const parentPrompt = parentGeneration ? JSON.parse(parentGeneration.prompt_json) : undefined;
      const prompt = await generateStructuredPrompt(
        idea, 
        project ? { brief: project.brief, global_style: project.global_style } : undefined, 
        parentPrompt,
        feedback
      );
      setStructuredPrompt(prompt);
      
      if (autoDevelop) {
        await handleGenerateImage(prompt);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  const handleGenerateImage = async (overridePrompt?: StructuredPrompt) => {
    if (!hasSelectedKey) {
      await handleSelectKey();
      // Even if they cancel, we try to proceed, but the API call will fail with a clear error
    }
    const promptToUse = overridePrompt || structuredPrompt;
    if (!promptToUse) return;
    setIsGeneratingImage(true);
    setBatchResults([]);
    try {
      const batchId = Math.random().toString(36).substring(7);
      const refImages = references
        .filter(r => selectedReferences.includes(r.id))
        .map(r => r.image_data);

      // Generate 4 images in parallel
      const generationPromises = Array(4).fill(null).map(async (_, idx) => {
        try {
          const image = await generateImage(promptToUse, refImages);
          const res = await api.saveGeneration({
            idea,
            prompt_json: JSON.stringify(promptToUse),
            image_data: image,
            parent_id: parentGeneration?.id || null,
            project_id: currentProjectId,
            feedback: feedback || null,
            batch_id: batchId,
            selected_references: JSON.stringify(selectedReferences)
          });
          
          const newGen = {
            id: res.id,
            idea,
            prompt_json: JSON.stringify(promptToUse),
            image_data: image,
            parent_id: parentGeneration?.id || null,
            project_id: currentProjectId,
            feedback: feedback || null,
            batch_id: batchId,
            selected_references: JSON.stringify(selectedReferences),
            created_at: new Date().toISOString()
          } as Generation;

          // Save to browser backup immediately
          await backupGenerationLocally(newGen);
          
          return newGen;
        } catch (err) {
          console.error(`Error generating image ${idx + 1}:`, err);
          return null;
        }
      });

      const results = (await Promise.all(generationPromises)).filter((r): r is Generation => r !== null);
      
      if (results.length > 0) {
        setBatchResults(results);
        setGeneratedImage(results[0].image_data);
        await loadData();
      } else {
        alert('Failed to generate images. Please check your API key or try again.');
      }
    } catch (error: any) {
      console.error(error);
      if (error.message?.includes('Requested entity was not found')) {
        setHasSelectedKey(false);
        alert('Your API key selection seems invalid. Please select a key from a paid Google Cloud project.');
      } else {
        alert('An unexpected error occurred during generation.');
      }
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleRefine = (gen: Generation) => {
    setParentGeneration(gen);
    setIdea(gen.idea);
    setStructuredPrompt(JSON.parse(gen.prompt_json));
    setIsRefining(true);
    setActiveTab('generate');
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const [isUploading, setIsUploading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'reference' | 'palette') => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Check file size (e.g., limit to 5MB for safety)
    if (file.size > 5 * 1024 * 1024) {
      alert('File is too large. Please upload an image smaller than 5MB.');
      return;
    }

    setIsUploading(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const base64 = reader.result as string;
        if (type === 'reference') {
          await api.saveReference({ name: file.name, image_data: base64, project_id: currentProjectId });
        } else {
          await api.savePalette({ name: file.name, image_data: base64, project_id: currentProjectId });
        }
        await loadData();
      } catch (error) {
        console.error('Upload failed:', error);
        alert('Failed to upload image. Please try again.');
      } finally {
        setIsUploading(false);
        // Clear the input so the same file can be uploaded again if needed
        e.target.value = '';
      }
    };
    reader.onerror = () => {
      alert('Error reading file.');
      setIsUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const addToShowcase = async (type: string, item_id: number) => {
    await api.addToShowcase({ type, item_id, project_id: currentProjectId });
    loadData();
  };

  const toggleStar = async (id: number) => {
    await api.toggleStar(id);
    loadData();
  };

  const saveToLibrary = async (gen: Generation) => {
    try {
      await api.saveLibraryItem({
        category: 'Generations',
        title: gen.idea,
        prompt: gen.idea, // Or maybe the structured prompt? The library prompt is usually text.
        project_id: 1 // Default to global project 1
      });
      alert('Saved to Library!');
      loadData();
    } catch (error) {
      console.error(error);
      alert('Failed to save to library.');
    }
  };

  const loadComments = async (id: number) => {
    const c = await api.getComments(id);
    setComments(c);
  };

  const handleAddComment = async () => {
    if (!selectedShowcaseItem || !newComment.trim()) return;
    await api.addComment(selectedShowcaseItem.id, { text: newComment, author: authorName });
    setNewComment('');
    loadComments(selectedShowcaseItem.id);
  };

  const handleGenerateMoodboard = async () => {
    if (!vibeInput.trim()) return;
    setIsGeneratingMoodboard(true);
    try {
      const mood = await generateMoodboard(vibeInput);
      // Save the generated palette
      const paletteImage = `https://picsum.photos/seed/${mood.palette.name}/800/450`;
      await api.savePalette({ name: mood.palette.name, image_data: paletteImage, project_id: currentProjectId });
      
      // Save reference prompts to library
      const libraryItems = mood.reference_prompts.map(p => ({
        category: 'Moodboard',
        title: mood.palette.name,
        prompt: p,
        project_id: 1
      }));
      await api.importLibrary(libraryItems);
      
      setVibeInput('');
      loadData();
      alert('Mood Board generated! Check your Palettes and Library.');
    } catch (error) {
      console.error(error);
    } finally {
      setIsGeneratingMoodboard(false);
    }
  };

  const handleCritique = async (gen: Generation) => {
    setSelectedForCritique(gen);
    setIsCritiquing(true);
    try {
      const result = await critiqueImage(gen.image_data, JSON.parse(gen.prompt_json));
      setCritiqueResult(result);
    } catch (error) {
      console.error(error);
    } finally {
      setIsCritiquing(false);
    }
  };

  const applyCritique = () => {
    if (!critiqueResult || !selectedForCritique) return;
    setIdea(selectedForCritique.idea + " (Refined)");
    setParentGeneration(selectedForCritique);
    setStructuredPrompt(critiqueResult.refined_prompt);
    setActiveTab('generate');
    setCritiqueResult(null);
    setSelectedForCritique(null);
  };

  const handleCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n');
      const items: Omit<PromptLibraryItem, "id" | "created_at">[] = [];
      
      // Basic CSV parsing (Category, Title, Prompt)
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Handle quotes in CSV
        const parts = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
        if (parts && parts.length >= 3) {
          items.push({
            category: parts[0].replace(/"/g, ''),
            title: parts[1].replace(/"/g, ''),
            prompt: parts[2].replace(/"/g, ''),
            project_id: 1
          });
        }
      }

      if (items.length > 0) {
        await api.importLibrary(items);
        loadData();
        alert(`Imported ${items.length} prompts.`);
      }
    };
    reader.readAsText(file);
  };

  const handleCSVExport = () => {
    if (library.length === 0) {
      alert("Library is empty.");
      return;
    }
    
    const headers = ["Category", "Title", "Prompt"];
    const rows = library.map(item => [
      `"${item.category.replace(/"/g, '""')}"`,
      `"${item.title.replace(/"/g, '""')}"`,
      `"${item.prompt.replace(/"/g, '""')}"`
    ]);
    
    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `prompt_library_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleBranch = (gen: Generation) => {
    handleRefine(gen);
  };

  const openShowcaseDetail = (item: ShowcaseItem) => {
    setSelectedShowcaseItem(item);
    loadComments(item.id);
  };

  const getGenerationForItem = (item: ShowcaseItem) => {
    if (item.type !== 'generation') return null;
    return history.find(g => g.id === item.item_id);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    setIsSearching(true);
    try {
      const results = await api.globalSearch(searchQuery);
      setSearchResults(results);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleRescue = async () => {
    setIsRescuing(true);
    try {
      const result = await api.rescueData();
      setRescueResult(result);
      loadInitialData();
      if (currentProjectId) loadProjectData(currentProjectId);
    } catch (error) {
      console.error(error);
    } finally {
      setIsRescuing(false);
    }
  };

  const [isGuest, setIsGuest] = useState(false);

  if (!user && !isGuest) {
    return (
      <LandingPage 
        onLogin={handleLogin} 
        isLoggingIn={isLoggingIn} 
        onContinueAsGuest={() => setIsGuest(true)} 
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-studio-bg">
      {/* Backup Suggestion Notification */}
      {showBackupSuggestion && (
        <div className="fixed bottom-6 right-6 z-[100] max-w-sm animate-in slide-in-from-right-8 duration-500">
          <div className="studio-card p-6 border-studio-accent bg-studio-accent/[0.02] shadow-2xl">
            <div className="flex gap-4">
              <div className="w-10 h-10 bg-studio-accent/10 rounded-full flex items-center justify-center text-studio-accent shrink-0">
                <LifeBuoy className="w-5 h-5" />
              </div>
              <div className="space-y-3">
                <h4 className="font-bold text-sm">Restore your images?</h4>
                <p className="text-xs text-studio-secondary leading-relaxed">
                  I noticed your server database is empty, but you have <strong>{browserBackupCount} images</strong> saved in this browser.
                </p>
                <div className="flex gap-3 pt-1">
                  <button 
                    onClick={() => {
                      setActiveTab('rescue');
                      setShowBackupSuggestion(false);
                    }}
                    className="text-[10px] font-bold uppercase tracking-widest text-studio-accent hover:underline"
                  >
                    Go to Rescue Center
                  </button>
                  <button 
                    onClick={() => setShowBackupSuggestion(false)}
                    className="text-[10px] font-bold uppercase tracking-widest text-studio-secondary hover:text-studio-text"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar - Refined Nav */}
      <nav className="w-full md:w-20 bg-studio-card flex flex-row md:flex-col items-center py-4 md:py-10 gap-6 z-50 border-b md:border-b-0 md:border-r border-studio-border/30">
        <div className="w-10 h-10 bg-studio-accent rounded-2xl flex items-center justify-center mb-0 md:mb-6 shadow-lg shadow-studio-accent/20">
          <Layers className="w-6 h-6 text-white" />
        </div>
        
        <div className="flex flex-row md:flex-col items-center gap-4 md:gap-6 flex-1">
          {[
            { id: 'dashboard', icon: LayoutGrid, label: 'Dashboard' },
            { id: 'moodboard', icon: Palette, label: 'Mood Board' },
            { id: 'generate', icon: Plus, label: 'Create' },
            { id: 'library', icon: Library, label: 'Library' },
            { id: 'showcase', icon: FolderHeart, label: 'Showcase' },
            { id: 'project', icon: Layers, label: 'Project' },
            { id: 'archive', icon: History, label: 'History' },
            { id: 'rescue', icon: LifeBuoy, label: 'Rescue Center' }
          ].map((tab) => (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`p-3 rounded-2xl transition-all relative ${activeTab === tab.id ? 'bg-studio-accent text-white shadow-md' : 'text-studio-secondary hover:bg-studio-bg hover:text-studio-text'}`}
              title={tab.label}
            >
              <tab.icon className="w-6 h-6" />
              {tab.id === 'rescue' && browserBackupCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-emerald-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full border-2 border-studio-card">
                  {browserBackupCount}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="mt-auto pt-6 border-t border-studio-border/30 w-full flex flex-col items-center gap-4">
          <button 
            onClick={handleExport}
            disabled={isExporting}
            className="p-3 rounded-2xl text-studio-secondary hover:bg-studio-bg hover:text-studio-accent transition-all"
            title="Export Workspace Backup"
          >
            <Download className="w-6 h-6" />
          </button>
          
          {user ? (
            <div className="flex flex-col items-center gap-4">
              <button 
                onClick={handleSyncToGCS}
                disabled={isSyncing}
                className={`p-3 rounded-2xl transition-all ${isSyncing ? 'animate-pulse text-studio-accent' : 'text-studio-secondary hover:bg-studio-bg hover:text-studio-accent'}`}
                title="Sync to Google Cloud"
              >
                <CloudUpload className="w-6 h-6" />
              </button>
              <button 
                onClick={handleLogout}
                className="p-3 rounded-2xl text-studio-secondary hover:bg-studio-bg hover:text-red-500 transition-all"
                title="Logout"
              >
                <LogOut className="w-6 h-6" />
              </button>
              {user.id === 'guest' && (
                <div className="px-2 py-1 bg-amber-100 text-amber-700 text-[8px] font-bold uppercase tracking-tighter rounded border border-amber-200 text-center">
                  Guest Mode
                </div>
              )}
              <div className="w-10 h-10 rounded-full bg-studio-bg border border-studio-border/50 flex items-center justify-center overflow-hidden hover:border-studio-accent transition-colors" title={user.name}>
                <img src={user.picture} alt={user.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              </div>
            </div>
          ) : (
            <button 
              onClick={handleLogin}
              disabled={isLoggingIn}
              className="w-10 h-10 rounded-full bg-studio-bg border border-studio-border/50 flex items-center justify-center overflow-hidden hover:border-studio-accent transition-colors"
              title="Sign in with Google"
            >
              <div className="w-full h-full bg-gradient-to-br from-studio-accent to-indigo-600 flex items-center justify-center text-white font-bold text-xs">
                {isLoggingIn ? '...' : <User className="w-5 h-5" />}
              </div>
            </button>
          )}
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto h-screen no-scrollbar">
        {!hasSelectedKey && (
          <div className="bg-studio-accent text-white px-6 py-3 flex items-center justify-between sticky top-0 z-50 shadow-lg">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5" />
              <p className="text-sm font-medium">
                High-quality image generation requires a Gemini API key. 
                <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="underline ml-1 hover:text-white/80">
                  Learn about billing
                </a>
              </p>
            </div>
            <button 
              onClick={handleSelectKey}
              className="bg-white text-studio-accent px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-white/90 transition-colors"
            >
              Select API Key
            </button>
          </div>
        )}
        <div className="max-w-7xl mx-auto p-6 md:p-12">
          
          {/* Project Switcher Bar */}
          <div className="mb-8 flex items-center justify-between bg-studio-card p-4 rounded-2xl border border-studio-border/30 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-widest text-studio-secondary">Active Project</span>
                <select 
                  value={currentProjectId}
                  onChange={(e) => setCurrentProjectId(Number(e.target.value))}
                  className="bg-transparent font-bold text-lg focus:outline-none cursor-pointer"
                >
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <button 
              onClick={handleCreateProject}
              disabled={isCreatingProject}
              className="studio-btn-secondary flex items-center gap-2 text-xs py-2"
            >
              <Plus className="w-4 h-4" />
              {isCreatingProject ? 'Creating...' : 'New Project'}
            </button>
          </div>

          {activeTab === 'dashboard' && (
            <div className="space-y-10">
              <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <h1 className="text-4xl font-bold tracking-tight">Main Dashboard</h1>
                  <p className="text-studio-secondary mt-1">Overview of your creative workspace.</p>
                </div>
                <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4">
                  <div className="flex items-center gap-4 p-4 bg-studio-card rounded-2xl border border-studio-border/30 shadow-sm">
                    <div className="w-12 h-12 rounded-full bg-studio-bg border border-studio-border/50 flex items-center justify-center overflow-hidden">
                      {user ? (
                        <img src={user.picture} alt={user.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-studio-accent to-indigo-600 flex items-center justify-center text-white font-bold text-lg">
                          ?
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest text-studio-secondary">Account Status</p>
                      <p className="font-bold">{user ? user.name : 'Guest Mode'}</p>
                      {user && <p className="text-[10px] text-studio-secondary truncate max-w-[120px]">{user.email}</p>}
                    </div>
                  </div>
                </div>
              </header>

              {/* Quick Start Actions */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div 
                  onClick={() => setActiveTab('moodboard')}
                  className="studio-card p-6 flex flex-col gap-4 cursor-pointer hover:border-studio-accent transition-all group"
                >
                  <div className="w-12 h-12 bg-studio-accent/10 rounded-2xl flex items-center justify-center text-studio-accent group-hover:bg-studio-accent group-hover:text-white transition-colors">
                    <Palette className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold">1. Build Mood Board</h3>
                    <p className="text-xs text-studio-secondary mt-1">Upload references and define your visual direction.</p>
                  </div>
                </div>
                
                <div 
                  onClick={() => setActiveTab('generate')}
                  className="studio-card p-6 flex flex-col gap-4 cursor-pointer hover:border-studio-accent transition-all group"
                >
                  <div className="w-12 h-12 bg-studio-accent/10 rounded-2xl flex items-center justify-center text-studio-accent group-hover:bg-studio-accent group-hover:text-white transition-colors">
                    <Plus className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold">2. Start Creating</h3>
                    <p className="text-xs text-studio-secondary mt-1">Generate images using your mood board as context.</p>
                  </div>
                </div>

                <div 
                  onClick={() => setActiveTab('showcase')}
                  className="studio-card p-6 flex flex-col gap-4 cursor-pointer hover:border-studio-accent transition-all group"
                >
                  <div className="w-12 h-12 bg-studio-accent/10 rounded-2xl flex items-center justify-center text-studio-accent group-hover:bg-studio-accent group-hover:text-white transition-colors">
                    <FolderHeart className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold">3. Review Showcase</h3>
                    <p className="text-xs text-studio-secondary mt-1">Present your curated assets for client approval.</p>
                  </div>
                </div>
              </div>

              {/* Global Search Bar */}
              <div className="max-w-2xl mx-auto w-full space-y-4">
                {beachArtFound && !searchResults && (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between animate-in fade-in zoom-in duration-500">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center text-white">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-emerald-900">Beach Art Found!</p>
                        <p className="text-[10px] text-emerald-700">I found {beachArtFound.generations.length} images and {beachArtFound.library.length} prompts related to "beach".</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => {
                        setSearchQuery('beach');
                        setSearchResults(beachArtFound);
                      }}
                      className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 hover:text-emerald-800"
                    >
                      View Results
                    </button>
                  </div>
                )}
                <form onSubmit={handleSearch} className="relative group">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-studio-secondary group-focus-within:text-studio-accent transition-colors" />
                  <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search across all projects (e.g., 'beach art')..."
                    className="w-full pl-12 pr-4 py-4 bg-studio-card border border-studio-border/30 rounded-2xl shadow-sm focus:ring-2 focus:ring-studio-accent/20 focus:border-studio-accent outline-none transition-all"
                  />
                  {isSearching && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                      <div className="w-5 h-5 border-2 border-studio-accent border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  )}
                </form>
              </div>

              {searchResults && (
                <div className="space-y-8 animate-in fade-in slide-in-from-top-4 duration-500">
                  <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold">Search Results for "{searchQuery}"</h2>
                    <button onClick={() => setSearchResults(null)} className="text-xs text-studio-secondary hover:text-studio-accent font-bold uppercase tracking-widest">Clear Results</button>
                  </div>

                  {searchResults.generations.length > 0 && (
                    <div className="space-y-4">
                      <h3 className="text-sm font-bold uppercase tracking-widest text-studio-secondary">Generations Found</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        {searchResults.generations.map(g => (
                          <div key={g.id} className="studio-card group cursor-pointer" onClick={() => {
                            setCurrentProjectId(g.project_id);
                            setActiveTab('archive');
                            setSearchResults(null);
                          }}>
                            <div className="aspect-square relative overflow-hidden rounded-t-xl">
                              <img src={g.image_data} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <span className="text-[10px] text-white font-bold uppercase">View in {g.project_name}</span>
                              </div>
                            </div>
                            <div className="p-2">
                              <p className="text-[10px] font-bold truncate">{g.idea}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {searchResults.library.length > 0 && (
                    <div className="space-y-4">
                      <h3 className="text-sm font-bold uppercase tracking-widest text-studio-secondary">Library Items Found</h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {searchResults.library.map(l => (
                          <div key={l.id} className="studio-card p-4 cursor-pointer" onClick={() => {
                            setCurrentProjectId(l.project_id);
                            setActiveTab('library');
                            setSearchResults(null);
                          }}>
                            <p className="text-xs font-bold text-studio-accent uppercase mb-1">{l.project_name}</p>
                            <h4 className="font-bold text-sm mb-1">{l.title}</h4>
                            <p className="text-xs text-studio-secondary line-clamp-2">{l.prompt}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {searchResults.generations.length === 0 && searchResults.library.length === 0 && (
                    <div className="studio-card p-10 text-center text-studio-secondary">
                      <p>No specific items found. Try a different keyword or check your projects below.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Stats Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  { label: 'Total Projects', value: projects.length, icon: Layers },
                  { label: 'Generations', value: projectStats.reduce((acc, s) => acc + s.generation_count, 0), icon: Sparkles },
                  { label: 'Library Items', value: projectStats.reduce((acc, s) => acc + s.library_count, 0), icon: Library },
                  { label: 'References', value: projectStats.reduce((acc, s) => acc + s.reference_count, 0), icon: ImageIcon }
                ].map((stat, i) => (
                  <div key={i} className="studio-card p-6 flex items-center gap-4">
                    <div className="w-10 h-10 bg-studio-accent/10 rounded-xl flex items-center justify-center text-studio-accent">
                      <stat.icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-studio-secondary">{stat.label}</p>
                      <p className="text-xl font-bold">{stat.value}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Recent Generations Section */}
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <History className="w-5 h-5 text-studio-accent" />
                    Recent Generations
                  </h2>
                  <button 
                    onClick={() => setActiveTab('archive')}
                    className="text-xs text-studio-secondary font-bold uppercase tracking-widest hover:text-studio-accent"
                  >
                    View All Archive
                  </button>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {history.slice(0, 6).map(item => (
                    <div 
                      key={item.id} 
                      className="studio-card group cursor-pointer overflow-hidden"
                      onClick={() => {
                        setGeneratedImage(item.image_data);
                        setIdea(item.idea);
                        setStructuredPrompt(JSON.parse(item.prompt_json));
                        setActiveTab('generate');
                      }}
                    >
                      <div className="aspect-square relative">
                        <img src={item.image_data} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" referrerPolicy="no-referrer" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Eye className="w-5 h-5 text-white" />
                        </div>
                      </div>
                      <div className="p-2">
                        <p className="text-[10px] font-bold truncate">{item.idea}</p>
                      </div>
                    </div>
                  ))}
                  {history.length === 0 && (
                    <div className="col-span-full studio-card p-12 text-center text-studio-secondary border-dashed">
                      <p className="text-sm">No generations yet. Start creating to see them here!</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Rescue & Debug Section */}
              <div className="flex flex-col md:flex-row gap-6">
                <div className="flex-1 studio-card p-8 border-studio-accent/20 bg-studio-accent/[0.02] space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-studio-accent rounded-xl flex items-center justify-center">
                      <LifeBuoy className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold">Data Recovery</h3>
                      <p className="text-xs text-studio-secondary">If your data seems missing after an update, use this to re-link it to your Main Workspace.</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={handleRescue}
                      disabled={isRescuing}
                      className="studio-btn-primary text-xs py-2 px-6"
                    >
                      {isRescuing ? 'Scanning Database...' : 'Run Data Rescue'}
                    </button>
                    <button 
                      onClick={() => setShowDebug(!showDebug)}
                      className="text-xs text-studio-secondary font-bold uppercase tracking-widest hover:text-studio-accent"
                    >
                      {showDebug ? 'Hide Debug Info' : 'Show Debug Info'}
                    </button>
                  </div>

                  {rescueResult && (
                    <div className="p-4 bg-white/50 rounded-xl border border-studio-border/30 text-[10px] font-mono space-y-1 animate-in fade-in zoom-in duration-300">
                      <p className="font-bold text-studio-accent uppercase mb-2">Rescue Operation Complete</p>
                      <p>Fixed Generations: {rescueResult.fixed.generations}</p>
                      <p>Fixed Library: {rescueResult.fixed.library}</p>
                      <p>Fixed Palettes: {rescueResult.fixed.palettes}</p>
                      <p>Total Database Generations: {rescueResult.totals.generations}</p>
                      <p className="mt-2 text-studio-secondary">All orphaned data has been moved to "Main Workspace".</p>
                    </div>
                  )}
                </div>

                {showDebug && (
                  <div className="flex-1 studio-card p-8 space-y-4 animate-in slide-in-from-right-4 duration-500">
                    <h3 className="font-bold">Database Diagnostics</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-studio-bg rounded-xl">
                        <p className="text-[10px] font-bold text-studio-secondary uppercase">Current Project ID</p>
                        <p className="text-lg font-bold">{currentProjectId}</p>
                      </div>
                      <div className="p-4 bg-studio-bg rounded-xl">
                        <p className="text-[10px] font-bold text-studio-secondary uppercase">Project Count</p>
                        <p className="text-lg font-bold">{projects.length}</p>
                      </div>
                    </div>
                    <p className="text-xs text-studio-secondary italic">
                      If "Total Database Generations" in Rescue info is higher than your current view, the data is likely in a different project.
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-6">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Layers className="w-5 h-5 text-studio-accent" />
                  Your Projects
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {projects.map(p => {
                    const stats = projectStats.find(s => s.id === p.id);
                    return (
                      <div 
                        key={p.id} 
                        onClick={() => {
                          setCurrentProjectId(p.id);
                          setActiveTab('project');
                        }}
                        className="studio-card p-8 text-left hover:border-studio-accent transition-all group cursor-pointer"
                      >
                        <div className="flex justify-between items-start mb-4">
                          <div className="w-12 h-12 bg-studio-accent/10 rounded-2xl flex items-center justify-center text-studio-accent group-hover:bg-studio-accent group-hover:text-white transition-colors">
                            <Layers className="w-6 h-6" />
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            {currentProjectId === p.id && (
                              <span className="text-[10px] bg-studio-accent text-white px-2 py-1 rounded-full font-bold uppercase tracking-widest">Active</span>
                            )}
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingProjectId(p.id);
                                setEditProjectName(p.name);
                              }}
                              className="text-[10px] text-studio-secondary hover:text-studio-accent font-bold uppercase tracking-widest"
                            >
                              Rename
                            </button>
                          </div>
                        </div>
                        {editingProjectId === p.id ? (
                          <div className="mb-4 flex gap-2" onClick={e => e.stopPropagation()}>
                            <input 
                              type="text" 
                              value={editProjectName}
                              onChange={e => setEditProjectName(e.target.value)}
                              className="studio-input py-1 text-sm flex-1"
                              autoFocus
                            />
                            <button onClick={() => handleRenameProject(p.id)} className="text-studio-accent font-bold text-xs uppercase">Save</button>
                            <button onClick={() => setEditingProjectId(null)} className="text-studio-secondary font-bold text-xs uppercase">Cancel</button>
                          </div>
                        ) : (
                          <h3 className="text-xl font-bold mb-2">{p.name}</h3>
                        )}
                        <p className="text-sm text-studio-secondary line-clamp-2 mb-6">{p.brief || 'No brief defined.'}</p>
                        
                        <div className="flex items-center gap-4 mb-6">
                          <div className="flex items-center gap-1 text-[10px] font-bold text-studio-secondary uppercase">
                            <Sparkles className="w-3 h-3" /> {stats?.generation_count || 0}
                          </div>
                          <div className="flex items-center gap-1 text-[10px] font-bold text-studio-secondary uppercase">
                            <Library className="w-3 h-3" /> {stats?.library_count || 0}
                          </div>
                          <div className="flex items-center gap-1 text-[10px] font-bold text-studio-secondary uppercase">
                            <ImageIcon className="w-3 h-3" /> {stats?.reference_count || 0}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-xs font-bold text-studio-accent uppercase tracking-widest">
                          Open Project <ArrowRight className="w-3 h-3" />
                        </div>
                      </div>
                    );
                  })}
                  <button 
                    onClick={handleCreateProject}
                    className="studio-card p-8 border-dashed flex flex-col items-center justify-center text-studio-secondary hover:border-studio-accent hover:text-studio-accent transition-all"
                  >
                    <div className="w-12 h-12 bg-studio-bg rounded-2xl flex items-center justify-center mb-4">
                      <Plus className="w-6 h-6" />
                    </div>
                    <span className="font-bold uppercase tracking-widest text-xs">Create New Project</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'rescue' && (
            <div className="space-y-12 max-w-4xl mx-auto">
              <header className="text-center space-y-4">
                <div className="w-20 h-20 bg-studio-accent/10 rounded-3xl flex items-center justify-center text-studio-accent mx-auto">
                  <LifeBuoy className="w-10 h-10" />
                </div>
                <h1 className="text-4xl font-bold tracking-tight">Rescue Center</h1>
                <p className="text-studio-secondary max-w-lg mx-auto">
                  Cloud Run environments are ephemeral, meaning the server's local database can reset. 
                  Use these tools to recover your data from browser backups or server rescue points.
                </p>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Browser Backup Card */}
                <div className="studio-card p-8 space-y-6 border-studio-accent/20 bg-studio-accent/[0.02]">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-studio-accent/10 rounded-2xl text-studio-accent">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">Browser Local Backup</h3>
                      <p className="text-xs text-studio-secondary">Stored safely in your browser's IndexedDB.</p>
                    </div>
                  </div>

                  <div className="p-4 bg-white rounded-2xl border border-studio-border/30">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-studio-secondary">Backup Status:</span>
                      <span className="text-sm font-bold text-emerald-600">Active</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-studio-secondary">Images Saved:</span>
                      <span className="text-sm font-bold">{browserBackupCount}</span>
                    </div>
                  </div>

                  <p className="text-xs text-studio-secondary leading-relaxed">
                    Every time you generate an image, we save a copy to your browser's local storage. 
                    If the server resets, you can push these back to the database.
                  </p>

                  <button 
                    onClick={restoreFromBrowser}
                    disabled={isRescuing || browserBackupCount === 0}
                    className="w-full studio-btn-primary flex items-center justify-center gap-2 py-4"
                  >
                    {isRescuing ? (
                      <>
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        Restoring...
                      </>
                    ) : (
                      <>
                        <CloudUpload className="w-5 h-5" />
                        Restore {browserBackupCount} Images
                      </>
                    )}
                  </button>
                </div>

                {/* Server Rescue Card */}
                <div className="studio-card p-8 space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-studio-secondary/10 rounded-2xl text-studio-secondary">
                      <Database className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">Server Rescue Point</h3>
                      <p className="text-xs text-studio-secondary">Internal server-side recovery.</p>
                    </div>
                  </div>

                  <div className="p-4 bg-studio-bg rounded-2xl border border-studio-border/30">
                    <p className="text-xs text-studio-secondary text-center py-4">
                      Attempts to recover data from the server's internal memory or temporary storage.
                    </p>
                  </div>

                  <button 
                    onClick={handleRescue}
                    disabled={isRescuing}
                    className="w-full py-4 border border-studio-border rounded-2xl font-bold text-sm hover:bg-studio-bg transition-colors flex items-center justify-center gap-2"
                  >
                    <RefreshCw className={`w-5 h-5 ${isRescuing ? 'animate-spin' : ''}`} />
                    Run Server Rescue
                  </button>

                  {rescueResult && (
                    <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl text-[10px] text-emerald-700 font-mono overflow-x-auto">
                      {JSON.stringify(rescueResult, null, 2)}
                    </div>
                  )}
                </div>
              </div>

              <div className="p-6 bg-amber-50 border border-amber-200 rounded-3xl flex gap-4">
                <AlertCircle className="w-6 h-6 text-amber-600 shrink-0" />
                <div className="space-y-1">
                  <p className="text-sm font-bold text-amber-900">Pro Tip: Use Supabase for Persistence</p>
                  <p className="text-xs text-amber-800 leading-relaxed">
                    To stop losing data permanently, connect a Supabase database in the AI Studio Settings. 
                    This will replace the ephemeral local database with a persistent Postgres instance.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'generate' && (
            <div className="space-y-10">
              <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h1 className="text-4xl font-bold tracking-tight">Creative Lab</h1>
                    {selectedReferences.length > 0 && (
                      <div className="flex items-center gap-1 px-2 py-1 bg-studio-accent/10 text-studio-accent rounded-lg text-[10px] font-bold uppercase tracking-wider animate-pulse">
                        <Palette className="w-3 h-3" />
                        Mood Active
                      </div>
                    )}
                    <div className="h-8 w-[1px] bg-studio-border/30 mx-2 hidden md:block"></div>
                    <select 
                      value={currentProjectId || ''} 
                      onChange={(e) => setCurrentProjectId(Number(e.target.value))}
                      className="bg-studio-bg border-none text-studio-accent font-bold text-sm uppercase tracking-widest focus:ring-0 cursor-pointer hover:underline p-0"
                    >
                      {projects.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-studio-secondary">Transform concepts into visual assets.</p>
                    <button 
                      onClick={() => setActiveTab('moodboard')}
                      className="text-[10px] text-studio-accent font-bold hover:underline flex items-center gap-1"
                    >
                      <ArrowLeft className="w-3 h-3" />
                      Adjust Mood Board
                    </button>
                  </div>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                  <button 
                    onClick={() => {
                      setIdea('');
                      setParentGeneration(null);
                      setFeedback('');
                      setStructuredPrompt(null);
                      setGeneratedImage(null);
                      setBatchResults([]);
                      setSelectedReferences([]);
                    }}
                    className="studio-btn-secondary flex items-center gap-2 text-sm"
                  >
                    <Trash2 className="w-4 h-4" />
                    Clear
                  </button>
                  <button onClick={() => setShowPrompt(!showPrompt)} className="studio-btn-secondary flex items-center gap-2 text-sm">
                    {showPrompt ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    {showPrompt ? 'Hide Logic' : 'Show Logic'}
                  </button>
                </div>
              </header>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Input Panel */}
                <div className="lg:col-span-5 space-y-6">
                  <div className="studio-card p-8 space-y-6">
                    {parentGeneration && (
                      <div className="flex items-center gap-2 p-3 bg-studio-accent/5 border border-studio-accent/20 rounded-xl">
                        <GitBranch className="w-4 h-4 text-studio-accent" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] text-studio-secondary uppercase font-bold">Branching From</p>
                          <p className="text-xs font-medium truncate">{parentGeneration.idea}</p>
                        </div>
                        <button onClick={() => setParentGeneration(null)} className="p-1 hover:bg-studio-bg rounded-md">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-bold uppercase tracking-widest text-studio-secondary">Concept Idea</label>
                        <button 
                          onClick={() => setActiveTab('library')}
                          className="text-[10px] text-studio-accent font-bold hover:underline flex items-center gap-1"
                        >
                          <Library className="w-3 h-3" />
                          From Library
                        </button>
                      </div>
                      <textarea 
                        value={idea}
                        onChange={(e) => setIdea(e.target.value)}
                        placeholder="Describe the visual essence..."
                        className="w-full studio-input h-32 resize-none"
                      />
                    </div>

                    {parentGeneration && (
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <label className="text-xs font-bold uppercase tracking-widest text-studio-secondary">Refinement Feedback</label>
                          <button 
                            onClick={() => {
                              setParentGeneration(null);
                              setFeedback('');
                            }}
                            className="text-[10px] text-red-500 font-bold hover:underline"
                          >
                            Cancel Refinement
                          </button>
                        </div>
                        <textarea 
                          value={feedback}
                          onChange={(e) => setFeedback(e.target.value)}
                          placeholder="What would you like to change? (e.g., 'Make it moodier', 'Add more blue')"
                          className="w-full studio-input h-24 resize-none border-studio-accent/30"
                        />
                      </div>
                    )}

                    <div className="space-y-3">
                      <label className="text-xs font-bold uppercase tracking-widest text-studio-secondary">Visual Context (References)</label>
                      <div className="flex flex-wrap gap-2">
                        {references.map(ref => (
                          <button
                            key={ref.id}
                            onClick={() => {
                              setSelectedReferences(prev => 
                                prev.includes(ref.id) ? prev.filter(id => id !== ref.id) : [...prev, ref.id]
                              );
                            }}
                            className={`relative w-12 h-12 rounded-lg overflow-hidden border-2 transition-all ${
                              selectedReferences.includes(ref.id) ? 'border-studio-accent scale-110' : 'border-transparent opacity-60'
                            }`}
                          >
                            <img src={ref.image_data} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            {selectedReferences.includes(ref.id) && (
                              <div className="absolute inset-0 bg-studio-accent/20 flex items-center justify-center">
                                <CheckCircle2 className="w-4 h-4 text-white" />
                              </div>
                            )}
                          </button>
                        ))}
                        <button 
                          onClick={() => refUploadRef.current?.click()}
                          className="w-12 h-12 rounded-lg border-2 border-dashed border-studio-border flex items-center justify-center text-studio-secondary hover:border-studio-accent hover:text-studio-accent transition-all"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <input 
                        type="checkbox" 
                        id="autoDevelop" 
                        checked={autoDevelop}
                        onChange={(e) => setAutoDevelop(e.target.checked)}
                        className="w-4 h-4 accent-studio-accent"
                      />
                      <label htmlFor="autoDevelop" className="text-[10px] font-bold uppercase tracking-widest text-studio-secondary cursor-pointer">Auto-Develop Visuals</label>
                    </div>

                    <button 
                      onClick={handleGeneratePrompt}
                      disabled={isGeneratingPrompt || !idea}
                      className="studio-btn-primary w-full flex items-center justify-center gap-2"
                    >
                      {isGeneratingPrompt ? 'Engineering...' : parentGeneration ? 'Refine Concept' : 'Engineer Concept'}
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  {structuredPrompt && (
                    <div className={`studio-card p-8 space-y-6 transition-all ${showPrompt ? 'opacity-100' : 'opacity-40 grayscale pointer-events-none'}`}>
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-bold uppercase tracking-widest text-studio-secondary">Technical Spec</label>
                        <span className="text-[10px] bg-studio-bg px-2 py-1 rounded-md font-mono">JSON_V1</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="space-y-1">
                          <span className="text-[10px] text-studio-secondary uppercase">Style</span>
                          <p className="font-medium truncate">{structuredPrompt.style}</p>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] text-studio-secondary uppercase">Lighting</span>
                          <p className="font-medium truncate">{structuredPrompt.lighting}</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleGenerateImage()}
                        disabled={isGeneratingImage}
                        className="studio-btn-primary bg-studio-text w-full"
                      >
                        {isGeneratingImage ? 'Developing...' : 'Develop Visual'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Result Panel */}
                <div className="lg:col-span-7 space-y-6">
                  <div className="studio-card h-[500px] flex items-center justify-center bg-[#F2F2F7] relative overflow-hidden">
                    {isGeneratingImage ? (
                      <div className="flex flex-col items-center gap-4">
                        <div className="w-12 h-12 border-4 border-studio-accent border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-sm font-medium text-studio-secondary">Synthesizing visual data...</p>
                      </div>
                    ) : generatedImage ? (
                      <div className="w-full h-full relative group">
                        <img src={generatedImage} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                        <div className="absolute bottom-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => {
                              const gen = batchResults.find(r => r.image_data === generatedImage) || history.find(r => r.image_data === generatedImage);
                              if (gen) handleRefine(gen);
                            }}
                            className="bg-white/90 backdrop-blur-md text-studio-text px-6 py-3 rounded-2xl shadow-2xl border border-white/20 flex items-center gap-2 font-bold text-sm hover:bg-studio-accent hover:text-white transition-all"
                          >
                            <Wand2 className="w-4 h-4" />
                            Rework this Version
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center space-y-4 opacity-20">
                        <ImageIcon className="w-20 h-20 mx-auto" />
                        <p className="text-lg font-medium">Visual output will appear here</p>
                      </div>
                    )}
                  </div>

                  {batchResults.length > 0 && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold uppercase tracking-widest text-studio-secondary">Contact Sheet (Batch Results)</h3>
                        <span className="text-[10px] bg-studio-accent/10 text-studio-accent px-2 py-1 rounded-full font-bold">4 VARIATIONS</span>
                      </div>
                      <div className="grid grid-cols-4 gap-4">
                        {batchResults.map((res, idx) => (
                          <div key={res.id} className="group relative aspect-square rounded-xl overflow-hidden bg-studio-card border border-studio-border/30 shadow-sm">
                            <img 
                              src={res.image_data} 
                              className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-500" 
                              onClick={() => setGeneratedImage(res.image_data)}
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                              <button 
                                onClick={() => handleRefine(res)}
                                className="p-2 bg-white rounded-full shadow-lg hover:bg-studio-accent hover:text-white transition-all"
                                title="Refine this version"
                              >
                                <Wand2 className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => addToShowcase('generation', res.id)}
                                className="p-2 bg-white rounded-full shadow-lg hover:bg-studio-accent hover:text-white transition-all"
                                title="Save to Gallery"
                              >
                                <FolderHeart className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => saveToLibrary(res)}
                                className="p-2 bg-white rounded-full shadow-lg hover:bg-studio-accent hover:text-white transition-all"
                                title="Save to Library"
                              >
                                <Library className="w-4 h-4" />
                              </button>
                            </div>
                            <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[8px] px-1 rounded">
                              v{idx + 1}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'project' && project && (
            <div className="space-y-10 max-w-3xl">
              <header>
                <h1 className="text-4xl font-bold tracking-tight">Project Brief</h1>
                <p className="text-studio-secondary mt-1">Define the central identity of this creative session.</p>
              </header>

              <div className="grid grid-cols-1 gap-8">
                <div className="studio-card p-10 space-y-8">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-studio-secondary">Project Name</label>
                    <input 
                      type="text" 
                      value={project.name}
                      onChange={(e) => setProject({...project, name: e.target.value})}
                      className="w-full studio-input"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-studio-secondary">Creative Brief</label>
                    <textarea 
                      value={project.brief}
                      onChange={(e) => setProject({...project, brief: e.target.value})}
                      placeholder="What is the core objective and story?"
                      className="w-full studio-input h-40 resize-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-studio-secondary">Global Visual Style</label>
                    <input 
                      type="text" 
                      value={project.global_style}
                      onChange={(e) => setProject({...project, global_style: e.target.value})}
                      placeholder="e.g., Cinematic, Retro-Futuristic, High-Contrast Minimalist"
                      className="w-full studio-input"
                    />
                    <p className="text-[10px] text-studio-secondary italic">This style will be automatically integrated into every generation to ensure consistency.</p>
                  </div>

                  <button 
                    onClick={handleUpdateProject}
                    disabled={isSavingProject}
                    className="studio-btn-primary w-full"
                  >
                    {isSavingProject ? 'Saving Identity...' : 'Save Project Identity'}
                  </button>
                </div>

                {history.length > 0 && (
                  <div className="studio-card p-10 space-y-6">
                    <h3 className="font-bold flex items-center gap-2">
                      <History className="w-5 h-5 text-studio-accent" />
                      Recent Work in this Project
                    </h3>
                    <div className="grid grid-cols-3 gap-4">
                      {history.slice(0, 3).map(item => (
                        <div key={item.id} className="aspect-square rounded-lg overflow-hidden bg-studio-bg">
                          <img src={item.image_data} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        </div>
                      ))}
                    </div>
                    <button 
                      onClick={() => setActiveTab('archive')}
                      className="text-xs text-studio-accent font-bold uppercase tracking-widest"
                    >
                      View Full Project Archive
                    </button>
                  </div>
                )}

                <div className="studio-card p-10 space-y-6 border-studio-accent/20 bg-studio-accent/[0.02]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-studio-accent rounded-xl flex items-center justify-center">
                      <Wand2 className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold">Vibe Engine</h3>
                      <p className="text-xs text-studio-secondary">Generate a complete project identity from a single vibe.</p>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-studio-secondary">Describe the Vibe</label>
                    <input 
                      type="text" 
                      value={vibeInput}
                      onChange={(e) => setVibeInput(e.target.value)}
                      placeholder="e.g., A rainy Tuesday in 1980s Tokyo..."
                      className="w-full studio-input"
                    />
                  </div>

                  <button 
                    onClick={handleGenerateMoodboard}
                    disabled={isGeneratingMoodboard || !vibeInput}
                    className="studio-btn-secondary w-full border-studio-accent text-studio-accent hover:bg-studio-accent hover:text-white"
                  >
                    {isGeneratingMoodboard ? 'Synthesizing Vibe...' : 'Generate Mood Board & Library'}
                  </button>
                </div>

                {/* Project Assets Section */}
                <div className="studio-card p-10 space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold">Project Assets</h3>
                    <button 
                      onClick={() => setActiveTab('moodboard')}
                      className="text-xs text-studio-accent font-bold hover:underline"
                    >
                      View All
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-studio-secondary">Linked Palettes</p>
                      <div className="flex -space-x-2 overflow-hidden">
                        {palettes.slice(0, 5).map(p => (
                          <img 
                            key={p.id} 
                            src={p.image_data} 
                            className="inline-block h-10 w-10 rounded-full ring-2 ring-white object-cover" 
                            referrerPolicy="no-referrer"
                          />
                        ))}
                        {palettes.length > 5 && (
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-studio-bg ring-2 ring-white text-[10px] font-bold">
                            +{palettes.length - 5}
                          </div>
                        )}
                        {palettes.length === 0 && <p className="text-xs text-studio-secondary italic">None yet</p>}
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-studio-secondary">Linked References</p>
                      <div className="flex -space-x-2 overflow-hidden">
                        {references.slice(0, 5).map(r => (
                          <img 
                            key={r.id} 
                            src={r.image_data} 
                            className="inline-block h-10 w-10 rounded-full ring-2 ring-white object-cover" 
                            referrerPolicy="no-referrer"
                          />
                        ))}
                        {references.length > 5 && (
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-studio-bg ring-2 ring-white text-[10px] font-bold">
                            +{references.length - 5}
                          </div>
                        )}
                        {references.length === 0 && <p className="text-xs text-studio-secondary italic">None yet</p>}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'library' && (
            <div className="space-y-10">
              <header className="flex justify-between items-end">
                <div>
                  <h1 className="text-4xl font-bold tracking-tight">Prompt Library</h1>
                  <p className="text-studio-secondary mt-1">Your categorized collection of creative starters.</p>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={handleCSVExport}
                    className="studio-btn-secondary flex items-center gap-2"
                  >
                    <Copy className="w-4 h-4" />
                    Export CSV
                  </button>
                  <button 
                    onClick={() => csvUploadRef.current?.click()}
                    className="studio-btn-secondary flex items-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    Import CSV
                  </button>
                  <input type="file" ref={csvUploadRef} className="hidden" onChange={handleCSVImport} accept=".csv" />
                </div>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {library.map(item => (
                  <div key={item.id} className="studio-card p-6 space-y-4 group">
                    <div className="flex justify-between items-start">
                      <span className="text-[10px] bg-studio-bg px-2 py-1 rounded-md font-bold text-studio-accent uppercase tracking-widest">
                        {item.category}
                      </span>
                      <button 
                        onClick={() => api.deleteLibraryItem(item.id).then(loadData)}
                        className="p-1 text-studio-secondary hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div>
                      <h3 className="font-bold">{item.title}</h3>
                      <p className="text-sm text-studio-secondary mt-2 line-clamp-3 italic">"{item.prompt}"</p>
                    </div>
                    <button 
                      onClick={() => {
                        setIdea(item.prompt);
                        setParentGeneration(null);
                        setFeedback('');
                        setStructuredPrompt(null);
                        setGeneratedImage(null);
                        setBatchResults([]);
                        setActiveTab('generate');
                      }}
                      className="studio-btn-secondary w-full text-xs py-2"
                    >
                      Use as Base
                    </button>
                  </div>
                ))}
                {library.length === 0 && (
                  <div className="col-span-full studio-card border-dashed p-20 text-center text-studio-secondary">
                    <FileText className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p className="text-lg font-medium">Your library is empty for this project.</p>
                    <p className="text-sm">Try switching projects at the top or import a CSV to get started.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'archive' && (
            <div className="space-y-10">
              <header>
                <h1 className="text-4xl font-bold tracking-tight">Archive</h1>
                <p className="text-studio-secondary mt-1">Your library of generated assets.</p>
              </header>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {history.length === 0 && (
                  <div className="col-span-full studio-card border-dashed p-20 text-center text-studio-secondary">
                    <History className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p className="text-lg font-medium">No images in this project yet.</p>
                    <p className="text-sm">Try switching projects in the top bar if you're looking for older work.</p>
                  </div>
                )}
                {history.map(item => (
                  <div key={item.id} className="studio-card group">
                    <div className="aspect-square bg-studio-bg relative overflow-hidden">
                      <img src={item.image_data} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" referrerPolicy="no-referrer" />
                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                        <button 
                          onClick={() => handleBranch(item)}
                          className="p-3 bg-white rounded-full shadow-lg hover:bg-studio-accent hover:text-white transition-all"
                          title="Rework & Iterate"
                        >
                          <GitBranch className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => handleCritique(item)}
                          className="p-3 bg-white rounded-full shadow-lg hover:bg-studio-accent hover:text-white transition-all"
                          title="AI Critique"
                        >
                          <Wand2 className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => addToShowcase('generation', item.id)}
                          className="p-3 bg-white rounded-full shadow-lg hover:bg-studio-accent hover:text-white transition-all"
                          title="Pin to Showcase"
                        >
                          <FolderHeart className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => saveToLibrary(item)}
                          className="p-3 bg-white rounded-full shadow-lg hover:bg-studio-accent hover:text-white transition-all"
                          title="Save Prompt to Library"
                        >
                          <Library className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{item.idea}</p>
                          {item.parent_id && (
                            <div className="flex items-center gap-1 mt-1 text-[10px] text-studio-accent font-medium">
                              <GitBranch className="w-3 h-3" />
                              <span className="truncate">Branched from ID: {item.parent_id}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <p className="text-[10px] text-studio-secondary mt-1">{new Date(item.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'moodboard' && (
            <div className="space-y-12">
              <header className="flex justify-between items-end">
                <div>
                  <h1 className="text-4xl font-bold tracking-tight">Mood Board</h1>
                  <p className="text-studio-secondary mt-1">Visual references and color inspiration.</p>
                </div>
                <button 
                  onClick={() => {
                    setSelectedReferences(references.map(r => r.id));
                    setActiveTab('generate');
                  }}
                  className="studio-btn-primary flex items-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  Start Creating
                </button>
              </header>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                {/* Visual Palettes */}
                <section className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                      <Palette className="w-5 h-5 text-studio-accent" />
                      Visual Palettes
                    </h2>
                    <button 
                      onClick={() => paletteUploadRef.current?.click()}
                      disabled={isUploading}
                      className={`text-studio-accent text-sm font-semibold hover:underline ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {isUploading ? 'Uploading...' : 'Add Palette'}
                    </button>
                    <input type="file" ref={paletteUploadRef} className="hidden" onChange={(e) => handleFileUpload(e, 'palette')} accept="image/*" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {palettes.map(p => (
                      <div key={p.id} className="studio-card group relative aspect-video">
                        <img src={p.image_data} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <button 
                            onClick={() => addToShowcase('palette', p.id)}
                            className="studio-btn-primary text-xs py-2"
                          >
                            Pin to Show
                          </button>
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/60 to-transparent">
                          <p className="text-white text-xs font-medium truncate">{p.name}</p>
                        </div>
                      </div>
                    ))}
                    {palettes.length === 0 && (
                      <div className="col-span-2 studio-card border-dashed p-10 text-center text-studio-secondary">
                        <p>Upload Pinterest snapshots for color inspiration.</p>
                      </div>
                    )}
                  </div>
                </section>

                {/* Reference Images */}
                <section className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                      <ImageIcon className="w-5 h-5 text-studio-accent" />
                      Style References
                    </h2>
                    <button 
                      onClick={() => refUploadRef.current?.click()}
                      disabled={isUploading}
                      className={`text-studio-accent text-sm font-semibold hover:underline ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {isUploading ? 'Uploading...' : 'Add Reference'}
                    </button>
                    <input type="file" ref={refUploadRef} className="hidden" onChange={(e) => handleFileUpload(e, 'reference')} accept="image/*" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {references.map(ref => (
                      <div key={ref.id} className="studio-card group relative aspect-square">
                        <img src={ref.image_data} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <button 
                            onClick={() => addToShowcase('reference', ref.id)}
                            className="studio-btn-primary text-xs py-2"
                          >
                            Pin to Show
                          </button>
                        </div>
                      </div>
                    ))}
                    {references.length === 0 && (
                      <div className="col-span-2 studio-card border-dashed p-10 text-center text-studio-secondary">
                        <p>Upload snapshots of styles you like.</p>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </div>
          )}

          {activeTab === 'showcase' && (
            <div className="space-y-10">
              <header>
                <h1 className="text-4xl font-bold tracking-tight">Showcase</h1>
                <p className="text-studio-secondary mt-1">The presentation folder for client review.</p>
              </header>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                {showcase.map(item => (
                  <div key={item.id} className="studio-card flex flex-col group">
                    <div 
                      className="aspect-[4/3] bg-studio-bg relative overflow-hidden cursor-pointer"
                      onClick={() => openShowcaseDetail(item)}
                    >
                      {item.image_preview ? (
                        <img src={item.image_preview} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-studio-accent/5 text-studio-accent font-bold">PALETTE</div>
                      )}
                    </div>
                    <div className="p-6 flex justify-between items-center">
                      <div className="space-y-1">
                        <h3 className="font-bold truncate max-w-[180px]">{item.title || 'Untitled Asset'}</h3>
                        <p className="text-[10px] text-studio-secondary uppercase tracking-widest">{item.type}</p>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => toggleStar(item.id)}
                          className={`p-2 rounded-full border transition-all ${item.starred ? 'bg-yellow-400 border-yellow-400 text-white' : 'border-studio-border text-studio-secondary hover:bg-studio-bg'}`}
                        >
                          <Star className={`w-4 h-4 ${item.starred ? 'fill-current' : ''}`} />
                        </button>
                        <button 
                          onClick={() => openShowcaseDetail(item)}
                          className="p-2 rounded-full border border-studio-border text-studio-secondary hover:bg-studio-bg"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Presentation Modal - Hidden Prompts, Side-by-Side feel */}
      {selectedShowcaseItem && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-10">
          <div className="absolute inset-0 bg-studio-text/40 backdrop-blur-md" onClick={() => setSelectedShowcaseItem(null)}></div>
          <div className="studio-card w-full max-w-6xl h-full max-h-[85vh] flex flex-col md:flex-row relative z-10 p-0 shadow-2xl">
            {/* Visual Display */}
            <div className="flex-1 bg-[#111] flex items-center justify-center p-6">
              {selectedShowcaseItem.image_preview ? (
                <img src={selectedShowcaseItem.image_preview} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" referrerPolicy="no-referrer" />
              ) : (
                <div className="text-white text-2xl font-bold">PALETTE_PREVIEW</div>
              )}
            </div>

            {/* Feedback Sidebar */}
            <div className="w-full md:w-[400px] flex flex-col bg-studio-card">
              <div className="p-8 border-b border-studio-border/30 flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold">{selectedShowcaseItem.title}</h2>
                  <p className="text-xs text-studio-secondary uppercase tracking-widest mt-1">Review Session</p>
                </div>
                <button onClick={() => setSelectedShowcaseItem(null)} className="p-2 hover:bg-studio-bg rounded-full">
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-8 space-y-6 no-scrollbar">
                {selectedShowcaseItem.type === 'generation' && (
                  <div className="space-y-6">
                    {getGenerationForItem(selectedShowcaseItem)?.feedback && (
                      <div className="space-y-2">
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-studio-secondary">Direction Feedback</h4>
                        <div className="bg-studio-accent/5 border border-studio-accent/20 p-4 rounded-xl text-xs italic text-studio-accent">
                          "{getGenerationForItem(selectedShowcaseItem)?.feedback}"
                        </div>
                      </div>
                    )}
                    
                    {getGenerationForItem(selectedShowcaseItem)?.selected_references && (
                      <div className="space-y-2">
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-studio-secondary">Visual Context</h4>
                        <div className="flex gap-2">
                          {JSON.parse(getGenerationForItem(selectedShowcaseItem)!.selected_references!).map((refId: number) => {
                            const ref = references.find(r => r.id === refId);
                            return ref ? (
                              <div key={refId} className="w-10 h-10 rounded-lg overflow-hidden border border-studio-border/30">
                                <img src={ref.image_data} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              </div>
                            ) : null;
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-4">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-studio-secondary">Comments</h4>
                  {comments.map(c => (
                    <div key={c.id} className="space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold">{c.author}</span>
                        <span className="text-[10px] text-studio-secondary">{new Date(c.created_at).toLocaleDateString()}</span>
                      </div>
                      <div className="bg-studio-bg p-4 rounded-2xl rounded-tl-none text-sm">
                        {c.text}
                      </div>
                    </div>
                  ))}
                  {comments.length === 0 && <p className="text-center text-studio-secondary text-sm italic py-10">No feedback yet.</p>}
                </div>
              </div>

              <div className="p-8 border-t border-studio-border/30 space-y-4">
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={authorName}
                    onChange={(e) => setAuthorName(e.target.value)}
                    placeholder="Your Role"
                    className="studio-input py-2 text-xs w-24"
                  />
                  <div className="flex-1 relative">
                    <input 
                      type="text" 
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Add a comment..."
                      className="studio-input py-2 pr-10 w-full"
                      onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                    />
                    <button onClick={handleAddComment} className="absolute right-2 top-1/2 -translate-y-1/2 text-studio-accent">
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Critique Modal */}
      {selectedForCritique && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-studio-text/60 backdrop-blur-sm" onClick={() => { setSelectedForCritique(null); setCritiqueResult(null); }}></div>
          <div className="studio-card w-full max-w-2xl relative z-10 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-studio-border/30 flex justify-between items-center bg-studio-card">
              <div className="flex items-center gap-3">
                <Wand2 className="w-5 h-5 text-studio-accent" />
                <h2 className="font-bold">AI Critique & Refinement</h2>
              </div>
              <button onClick={() => { setSelectedForCritique(null); setCritiqueResult(null); }} className="p-2 hover:bg-studio-bg rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar">
              <div className="aspect-video rounded-xl overflow-hidden bg-studio-bg">
                <img src={selectedForCritique.image_data} className="w-full h-full object-cover" />
              </div>

              {isCritiquing ? (
                <div className="py-12 flex flex-col items-center gap-4">
                  <div className="w-10 h-10 border-4 border-studio-accent border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-sm text-studio-secondary animate-pulse">Analyzing visual composition...</p>
                </div>
              ) : critiqueResult ? (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-studio-secondary flex items-center gap-2">
                      <Search className="w-3 h-3" />
                      Visual Analysis
                    </h4>
                    <p className="text-sm leading-relaxed text-studio-text/80 bg-studio-bg p-4 rounded-xl border border-studio-border/30">
                      {critiqueResult.analysis}
                    </p>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-studio-secondary flex items-center gap-2">
                      <CheckCircle2 className="w-3 h-3" />
                      Refinement Suggestions
                    </h4>
                    <ul className="grid grid-cols-1 gap-2">
                      {critiqueResult.suggestions.map((s, i) => (
                        <li key={i} className="text-xs flex items-start gap-2 p-3 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-100">
                          <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0" />
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="pt-4">
                    <button 
                      onClick={applyCritique}
                      className="studio-btn-primary w-full flex items-center justify-center gap-2"
                    >
                      Apply Refined Prompt
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center space-y-4">
                  <AlertCircle className="w-12 h-12 mx-auto text-studio-secondary opacity-20" />
                  <p className="text-studio-secondary">Failed to generate critique. Please try again.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
