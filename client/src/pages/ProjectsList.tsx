import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./ProjectsList.css";

interface Project {
  name: string;
  brand: string;
  language: string;
  country: string;
  domain: string;
  createdAt: string;
}

const API_URL = import.meta.env.VITE_API_URL || "";

const ProjectsList: React.FC = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_URL}/api/build/projects`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Не удалось загрузить список проектов");
      }

      setProjects(data.projects || []);
    } catch (err: any) {
      setError(err.message || "Произошла ошибка при загрузке проектов");
      console.error("Error loading projects:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (projectName: string, brand: string) => {
    if (!confirm(`Удалить проект «${brand}» (${projectName})? Это действие нельзя отменить.`)) {
      return;
    }
    try {
      setError(null);
      const response = await fetch(`${API_URL}/api/build/projects/${encodeURIComponent(projectName)}`, {
        method: "DELETE",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || "Не удалось удалить проект");
      }

      setProjects((prev) => prev.filter((p) => p.name !== projectName));
    } catch (err: any) {
      setError(err.message || "Произошла ошибка при удалении проекта");
      console.error("Error deleting project:", err);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("ru-RU", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="projects-list-container">
        <div className="loading">Загрузка проектов...</div>
      </div>
    );
  }

  return (
    <div className="projects-list-container">
      <div className="projects-header">
        <h1>Мои проекты</h1>
        <button onClick={loadProjects} className="refresh-button">
          🔄 Обновить
        </button>
      </div>

      {error && (
        <div className="error-message">
          <strong>Ошибка:</strong> {error}
        </div>
      )}

      {projects.length === 0 ? (
        <div className="empty-state">
          <p>Проектов пока нет</p>
          <p className="empty-hint">Создайте новый проект на странице генерации</p>
        </div>
      ) : (
        <div className="projects-grid">
          {projects.map((project) => (
            <div key={project.name} className="project-card">
              <div className="project-card-header">
                <div className="project-card-header-title">
                  <h2>{project.brand}</h2>
                  <span className="project-name">{project.name}</span>
                </div>
                <button
                  type="button"
                  className="project-delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(project.name, project.brand);
                  }}
                  title="Удалить проект"
                  aria-label="Удалить проект"
                >
                  ×
                </button>
              </div>
              <div className="project-card-body">
                <div className="project-info-item">
                  <span className="info-label">Язык:</span>
                  <span className="info-value">{project.language}</span>
                </div>
                <div className="project-info-item">
                  <span className="info-label">Страна:</span>
                  <span className="info-value">{project.country}</span>
                </div>
                {project.domain && (
                  <div className="project-info-item">
                    <span className="info-label">Домен:</span>
                    <span className="info-value">{project.domain}</span>
                  </div>
                )}
                <div className="project-info-item">
                  <span className="info-label">Создан:</span>
                  <span className="info-value">{formatDate(project.createdAt)}</span>
                </div>
              </div>
              <div className="project-card-footer">
                <button
                  className="project-action-button"
                  onClick={() => navigate(`/project/${project.name}`)}
                >
                  Открыть
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProjectsList;

