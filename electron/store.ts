import fs from 'fs';
import path from 'path';
import os from 'os';
import { ProjectItem, AppSettings } from '../src/types';
import { scanClaudeProjects, buildProjectItem } from './scanner';
import { findClaudeBinary } from './terminal';

const CONFIG_DIR = path.join(os.homedir(), '.claude-launcher');
const DATA_FILE = path.join(CONFIG_DIR, 'config.json');

interface StoredData {
  projects: ProjectItem[];
  settings: AppSettings;
}

const DEFAULT_SETTINGS: AppSettings = {
  defaultTerminal: 'Terminal',
  defaultEditor: 'VSCode',
  defaultFlags: {
    dangerouslySkipPermissions: true,
    continueLast: false,
    chrome: false,
    verbose: false,
    bare: false
  },
  claudePath: findClaudeBinary(),
  autoDetectOnStartup: true
};

export class StorageManager {
  private data: StoredData;

  constructor() {
    this.ensureDir();
    this.data = this.load();
  }

  private ensureDir() {
    if (!fs.existsSync(CONFIG_DIR)) {
      try {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
      } catch (err) {
        console.error('Failed to create config directory:', err);
      }
    }
  }

  private load(): StoredData {
    if (!fs.existsSync(DATA_FILE)) {
      // First run: auto-detect projects from ~/.claude.json
      const detected = scanClaudeProjects();
      const initialProjects = detected.map(d => buildProjectItem(d.path, undefined, d.lastStartTime, d.metrics));

      const initialData: StoredData = {
        projects: initialProjects,
        settings: DEFAULT_SETTINGS
      };

      this.saveDirect(initialData);
      return initialData;
    }

    try {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        projects: parsed.projects || [],
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) }
      };
    } catch (err) {
      console.error('Failed to read config file:', err);
      return {
        projects: [],
        settings: DEFAULT_SETTINGS
      };
    }
  }

  private saveDirect(data: StoredData) {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save config data:', err);
    }
  }

  public save(): void {
    this.saveDirect(this.data);
  }

  public getProjects(): ProjectItem[] {
    // Re-verify that projects still exist on disk and refresh their metadata (git branch, claude.md, etc.)
    return this.data.projects.map(p => {
      if (fs.existsSync(p.path)) {
        return buildProjectItem(p.path, p, p.lastLaunched);
      }
      return p;
    });
  }

  public getSettings(): AppSettings {
    return this.data.settings;
  }

  public updateSettings(newSettings: Partial<AppSettings>): AppSettings {
    this.data.settings = { ...this.data.settings, ...newSettings };
    this.save();
    return this.data.settings;
  }

  public addProject(projectPath: string, flags?: any): ProjectItem {
    // Check if already in list
    const existingIndex = this.data.projects.findIndex(p => p.path === projectPath);
    if (existingIndex >= 0) {
      return this.data.projects[existingIndex];
    }

    const item = buildProjectItem(projectPath, {
      flags: flags || this.data.settings.defaultFlags
    });

    this.data.projects.unshift(item);
    this.save();
    return item;
  }

  public updateProject(id: string, updates: Partial<ProjectItem>): ProjectItem | null {
    const idx = this.data.projects.findIndex(p => p.id === id);
    if (idx === -1) return null;

    this.data.projects[idx] = {
      ...this.data.projects[idx],
      ...updates
    };
    this.save();
    return this.data.projects[idx];
  }

  public removeProject(id: string): boolean {
    const prevLen = this.data.projects.length;
    this.data.projects = this.data.projects.filter(p => p.id !== id);
    if (this.data.projects.length !== prevLen) {
      this.save();
      return true;
    }
    return false;
  }

  public syncFromClaude(): { addedCount: number; totalCount: number } {
    const detected = scanClaudeProjects();
    let addedCount = 0;

    for (const d of detected) {
      const exists = this.data.projects.some(p => p.path === d.path);
      if (!exists && fs.existsSync(d.path)) {
        const item = buildProjectItem(d.path, {
          flags: this.data.settings.defaultFlags
        }, d.lastStartTime, d.metrics);
        this.data.projects.push(item);
        addedCount++;
      }
    }

    if (addedCount > 0) {
      this.save();
    }

    return { addedCount, totalCount: this.data.projects.length };
  }
}

