import { createRoot } from "react-dom/client";
import "../app.js";
import "../styles.css";
import { ProjectCreateDialog } from "./components/ProjectCreateDialog";

const mount = document.getElementById("projectCreateRoot");

if (!mount) {
  throw new Error("The project creation mount point is missing.");
}

createRoot(mount).render(<ProjectCreateDialog />);
