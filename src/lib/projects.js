const KEY = 'valora_projects';

const DEFAULT_PROJECT = {
  id: 'project-general',
  name: 'General',
  emoji: '📁',
  createdAt: 0,
};

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (!list.some((p) => p.id === DEFAULT_PROJECT.id)) {
      return [DEFAULT_PROJECT, ...list];
    }
    return list;
  } catch {
    return [DEFAULT_PROJECT];
  }
}

function write(list) {
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new Event('valora-store-change'));
}

export function getProjects() {
  return read();
}

export function getProject(id) {
  return read().find((p) => p.id === id) || DEFAULT_PROJECT;
}

export function createProject(name) {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const project = {
    id: `project-${Date.now()}`,
    name: trimmed,
    emoji: '📂',
    createdAt: Date.now(),
  };
  write([project, ...read()]);
  return project;
}

export function renameProject(id, name) {
  if (id === DEFAULT_PROJECT.id) return;
  write(read().map((p) => (p.id === id ? { ...p, name: name.trim() } : p)));
}

export function deleteProject(id) {
  if (id === DEFAULT_PROJECT.id) return;
  write(read().filter((p) => p.id !== id));
  const recent = JSON.parse(localStorage.getItem('valora_recent') || '[]');
  localStorage.setItem(
    'valora_recent',
    JSON.stringify(recent.map((r) => (r.projectId === id ? { ...r, projectId: DEFAULT_PROJECT.id } : r))),
  );
  window.dispatchEvent(new Event('valora-store-change'));
}

export function assignAnalysisToProject(propertyId, projectId) {
  const recent = JSON.parse(localStorage.getItem('valora_recent') || '[]');
  localStorage.setItem(
    'valora_recent',
    JSON.stringify(recent.map((r) => (r.id === propertyId ? { ...r, projectId } : r))),
  );
  window.dispatchEvent(new Event('valora-store-change'));
}

export const GENERAL_PROJECT_ID = DEFAULT_PROJECT.id;
