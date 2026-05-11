import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Navigation from "./components/Navigation";
import CreateProject from "./pages/CreateProject";
import ProjectsList from "./pages/ProjectsList";
import ProjectDetails from "./pages/ProjectDetails";
import "./App.css";

function App() {
  return (
    <Router>
      <div className="App">
        <Navigation />
        <Routes>
          <Route path="/" element={<CreateProject />} />
          <Route path="/projects" element={<ProjectsList />} />
          <Route path="/project/:projectName" element={<ProjectDetails />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
