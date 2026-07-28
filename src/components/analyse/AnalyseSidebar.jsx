import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getProperty } from '../../data/properties';
import { getRecent } from '../../lib/storage';
import {
  createProject,
  GENERAL_PROJECT_ID,
  getProjects,
} from '../../lib/projects';
import { useStore } from '../../hooks/useStore';

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function AnalyseSidebar({ activeId, activeProjectId, onProjectChange, collapsed, onToggle }) {
  useStore();
  const navigate = useNavigate();
  const [projectFilter, setProjectFilter] = useState(activeProjectId || GENERAL_PROJECT_ID);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  const projects = getProjects();
  const recent = getRecent();

  const filtered = useMemo(() => {
    return recent.filter((r) => {
      const pid = r.projectId || GENERAL_PROJECT_ID;
      return pid === projectFilter;
    });
  }, [recent, projectFilter, activeId]);

  const startNew = () => {
    navigate('/analyse', { viewTransition: true });
  };

  const submitProject = (e) => {
    e.preventDefault();
    const p = createProject(newProjectName);
    if (p) {
      setProjectFilter(p.id);
      onProjectChange?.(p.id);
      setNewProjectName('');
      setNewProjectOpen(false);
    }
  };

  return (
    <>
      <aside className={`ws-sidebar${collapsed ? ' ws-sidebar--collapsed' : ''}`}>
        <div className="ws-sidebar-top">
          <button type="button" className="ws-new-btn" onClick={startNew}>
            <span className="ws-new-icon">+</span>
            New analysis
          </button>
        </div>

        <div className="ws-sidebar-section">
          <div className="ws-section-label">Projects</div>
          <div className="ws-project-list">
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`ws-project-item${projectFilter === p.id ? ' ws-project-item--active' : ''}`}
                onClick={() => {
                  setProjectFilter(p.id);
                  onProjectChange?.(p.id);
                }}
              >
                <span className="ws-project-emoji">{p.emoji}</span>
                <span className="ws-project-name">{p.name}</span>
                <span className="ws-project-count">
                  {recent.filter((r) => (r.projectId || GENERAL_PROJECT_ID) === p.id).length}
                </span>
              </button>
            ))}
          </div>
          {newProjectOpen ? (
            <form className="ws-new-project-form" onSubmit={submitProject}>
              <input
                autoFocus
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Project name"
                className="ws-new-project-input"
              />
              <div className="ws-new-project-actions">
                <button type="submit" className="ws-link-btn">Create</button>
                <button type="button" className="ws-link-btn ws-link-btn--muted" onClick={() => setNewProjectOpen(false)}>Cancel</button>
              </div>
            </form>
          ) : (
            <button type="button" className="ws-add-project" onClick={() => setNewProjectOpen(true)}>
              + New project
            </button>
          )}
        </div>

        <div className="ws-sidebar-section ws-sidebar-section--grow">
          <div className="ws-section-label">Recent</div>
          {filtered.length === 0 ? (
            <p className="ws-empty-hint">Analyses in this project appear here.</p>
          ) : (
            <div className="ws-chat-list">
              {filtered.map((r) => {
                const p = getProperty(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    className={`ws-chat-item${activeId === r.id ? ' ws-chat-item--active' : ''}`}
                    onClick={() => navigate(`/analyse/${r.id}`, { viewTransition: true })}
                  >
                    <span className="ws-chat-title">{r.name || 'Untitled analysis'}</span>
                    <span className="ws-chat-meta">
                      {p?.score != null && <span className="ws-chat-score">{p.score}</span>}
                      {r.time && <span>{timeAgo(r.time)}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="ws-sidebar-foot">
          <Link to="/discover" viewTransition className="ws-foot-link">Discover briefs</Link>
          <Link to="/portfolio" viewTransition className="ws-foot-link">Portfolio</Link>
        </div>
      </aside>
      <button type="button" className="ws-sidebar-toggle" onClick={onToggle} aria-label="Toggle sidebar">
        {collapsed ? '›' : '‹'}
      </button>
    </>
  );
}
