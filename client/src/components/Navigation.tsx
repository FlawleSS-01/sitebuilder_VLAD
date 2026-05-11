import React from "react";
import { Link, useLocation } from "react-router-dom";
import "./Navigation.css";

const Navigation: React.FC = () => {
  const location = useLocation();

  return (
    <nav className="navigation">
      <div className="nav-container">
        <Link to="/" className="nav-logo">
          Site Builder
        </Link>
        <div className="nav-links">
          <Link
            to="/"
            className={`nav-link ${location.pathname === "/" ? "active" : ""}`}
          >
            Генерация
          </Link>
          <Link
            to="/projects"
            className={`nav-link ${location.pathname === "/projects" ? "active" : ""}`}
          >
            Проекты
          </Link>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;

