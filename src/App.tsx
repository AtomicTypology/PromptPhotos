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
  ArrowRight
} from 'lucide-react';
import { generateStructuredPrompt, generateImage, StructuredPrompt, generateMoodboard, Moodboard, critiqueImage, Critique } from './services/gemini';
import { api, Generation, StyleTemplate, Palette as PaletteType, ReferenceImage, ShowcaseItem, Comment, ProjectSettings, PromptLibraryItem } from './services/api';

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

  const [autoDevelop, setAutoDevelop] = useState(true);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (currentProjectId) {
      loadProjectData(currentProjectId);
    }
  }, [currentProjectId]);

  const loadInitialData = async () => {
    const projs = await api.getProjects();
    setProjects(projs);
    
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
      api.getLibrary(projectId),
      api.getStyles(projectId)
    ]);
    setHistory(h);
    setPalettes(p);
    setReferences(r);
    setShowcase(s);
    setProject(proj);
    setLibrary(lib);
  };

  const loadData = () => {
    if (currentProjectId) {
      loadProjectData(currentProjectId);
    }
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
      alert('Project settings updated.');
    } catch (error) {
      console.error(error);
    } finally {
      setIsSavingProject(false);
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
          return {
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
        } catch (err) {
          console.error(`Error generating image ${idx + 1}:`, err);
          return null;
        }
      });

      const results = (await Promise.all(generationPromises)).filter((r): r is Generation => r !== null);
      
      if (results.length > 0) {
        setBatchResults(results);
        setGeneratedImage(results[0].image_data);
        loadData();
      } else {
        alert('Failed to generate images. Please check your API key or try again.');
      }
    } catch (error) {
      console.error(error);
      alert('An unexpected error occurred during generation.');
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
        project_id: currentProjectId
      }));
      await api.importLibrary(libraryItems, currentProjectId);
      
      setVibeInput('');
      loadData();
      alert('Moodboard generated! Check your Palettes and Library.');
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
            project_id: currentProjectId
          });
        }
      }

      if (items.length > 0) {
        await api.importLibrary(items, currentProjectId);
        loadData();
        alert(`Imported ${items.length} prompts.`);
      }
    };
    reader.readAsText(file);
  };

  const handleBranch = (gen: Generation) => {
    setIdea(gen.idea + " (Branch)");
    setParentGeneration(gen);
    setStructuredPrompt(JSON.parse(gen.prompt_json));
    setActiveTab('generate');
  };

  const openShowcaseDetail = (item: ShowcaseItem) => {
    setSelectedShowcaseItem(item);
    loadComments(item.id);
  };

  const getGenerationForItem = (item: ShowcaseItem) => {
    if (item.type !== 'generation') return null;
    return history.find(g => g.id === item.item_id);
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-studio-bg">
      {/* Sidebar - Refined Nav */}
      <nav className="w-full md:w-20 bg-studio-card flex flex-row md:flex-col items-center py-4 md:py-10 gap-6 z-50 border-b md:border-b-0 md:border-r border-studio-border/30">
        <div className="w-10 h-10 bg-studio-accent rounded-2xl flex items-center justify-center mb-0 md:mb-6 shadow-lg shadow-studio-accent/20">
          <Layers className="w-6 h-6 text-white" />
        </div>
        
        <div className="flex flex-row md:flex-col items-center gap-4 md:gap-6 flex-1">
          {[
            { id: 'dashboard', icon: LayoutGrid, label: 'Dashboard' },
            { id: 'generate', icon: Plus, label: 'Create' },
            { id: 'project', icon: Layers, label: 'Project' },
            { id: 'library', icon: Library, label: 'Library' },
            { id: 'archive', icon: History, label: 'Archive' },
            { id: 'moodboard', icon: Palette, label: 'Mood' },
            { id: 'showcase', icon: FolderHeart, label: 'Show' }
          ].map((tab) => (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`p-3 rounded-2xl transition-all ${activeTab === tab.id ? 'bg-studio-accent text-white shadow-md' : 'text-studio-secondary hover:bg-studio-bg hover:text-studio-text'}`}
              title={tab.label}
            >
              <tab.icon className="w-6 h-6" />
            </button>
          ))}
        </div>

        <div className="mt-auto pt-6 border-t border-studio-border/30 w-full flex flex-col items-center gap-4">
          <button 
            onClick={() => alert('Profile settings coming soon!')}
            className="w-10 h-10 rounded-full bg-studio-bg border border-studio-border/50 flex items-center justify-center overflow-hidden hover:border-studio-accent transition-colors"
            title="Main Account"
          >
            <div className="w-full h-full bg-gradient-to-br from-studio-accent to-indigo-600 flex items-center justify-center text-white font-bold text-xs">
              JD
            </div>
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto h-screen no-scrollbar">
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
                <div className="flex items-center gap-4 p-4 bg-studio-card rounded-2xl border border-studio-border/30 shadow-sm">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-studio-accent to-indigo-600 flex items-center justify-center text-white font-bold text-lg">
                    JD
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-studio-secondary">Main Account</p>
                    <p className="font-bold">Creative Director</p>
                  </div>
                </div>
              </header>

              {/* Stats Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  { label: 'Total Projects', value: projects.length, icon: Layers },
                  { label: 'Generations', value: history.length, icon: Sparkles },
                  { label: 'Library Items', value: library.length, icon: Library },
                  { label: 'Showcase', value: showcase.length, icon: FolderHeart }
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

              <div className="space-y-6">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Layers className="w-5 h-5 text-studio-accent" />
                  Your Projects
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {projects.map(p => (
                    <button 
                      key={p.id} 
                      onClick={() => {
                        setCurrentProjectId(p.id);
                        setActiveTab('project');
                      }}
                      className="studio-card p-8 text-left hover:border-studio-accent transition-all group"
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div className="w-12 h-12 bg-studio-accent/10 rounded-2xl flex items-center justify-center text-studio-accent group-hover:bg-studio-accent group-hover:text-white transition-colors">
                          <Layers className="w-6 h-6" />
                        </div>
                        {currentProjectId === p.id && (
                          <span className="text-[10px] bg-studio-accent text-white px-2 py-1 rounded-full font-bold uppercase tracking-widest">Active</span>
                        )}
                      </div>
                      <h3 className="text-xl font-bold mb-2">{p.name}</h3>
                      <p className="text-sm text-studio-secondary line-clamp-2 mb-6">{p.brief || 'No brief defined.'}</p>
                      <div className="flex items-center gap-2 text-xs font-bold text-studio-accent uppercase tracking-widest">
                        Open Project <ArrowRight className="w-3 h-3" />
                      </div>
                    </button>
                  ))}
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

          {activeTab === 'generate' && (
            <div className="space-y-10">
              <header className="flex justify-between items-end">
                <div>
                  <h1 className="text-4xl font-bold tracking-tight">Creative Lab</h1>
                  <p className="text-studio-secondary mt-1">Transform concepts into visual assets.</p>
                </div>
                <div className="flex gap-2">
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
                        <label className="text-xs font-bold uppercase tracking-widest text-studio-secondary">Refinement Feedback</label>
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
                      <img src={generatedImage} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
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
                    {isGeneratingMoodboard ? 'Synthesizing Vibe...' : 'Generate Moodboard & Library'}
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
                          title="Branch from this"
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
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="flex justify-between items-start">
                        <p className="text-sm font-semibold truncate flex-1">{item.idea}</p>
                        {item.parent_id && <GitBranch className="w-3 h-3 text-studio-accent ml-2" />}
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
                  <h1 className="text-4xl font-bold tracking-tight">Moodboard</h1>
                  <p className="text-studio-secondary mt-1">Visual references and color inspiration.</p>
                </div>
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
