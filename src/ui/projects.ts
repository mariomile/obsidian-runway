import { TFile, TFolder } from 'obsidian';
import type { App } from 'obsidian';

export interface ProjectInfo {
  name: string;
  /** `status` from the project note's frontmatter, if it has one. */
  status: string | undefined;
  /** The project's main note: `<name>/<name>.md`, else the first note in its folder. */
  file: TFile | null;
}

function statusOf(app: App, file: TFile | null): string | undefined {
  if (!file) return undefined;
  const status: unknown = app.metadataCache.getFileCache(file)?.frontmatter?.status;
  return typeof status === 'string' && status !== '' ? status : undefined;
}

function mainNote(folder: TFolder): TFile | null {
  const named = folder.children.find(
    (child): child is TFile => child instanceof TFile && child.basename === folder.name && child.extension === 'md',
  );
  if (named) return named;
  return (
    folder.children.find((child): child is TFile => child instanceof TFile && child.extension === 'md') ?? null
  );
}

/** Projects under `projectsFolder`: each subfolder, plus loose notes at its top level. */
export function listProjects(app: App, projectsFolder: string): ProjectInfo[] {
  const root = projectsFolder.replace(/\/+$/, '');
  if (root === '') return [];
  const folder = app.vault.getFolderByPath(root);
  if (!folder) return [];
  const projects: ProjectInfo[] = [];
  for (const child of folder.children) {
    if (child instanceof TFolder) {
      const file = mainNote(child);
      projects.push({ name: child.name, status: statusOf(app, file), file });
    } else if (child instanceof TFile && child.extension === 'md') {
      projects.push({ name: child.basename, status: statusOf(app, child), file: child });
    }
  }
  return projects.sort((a, b) => a.name.localeCompare(b.name));
}
