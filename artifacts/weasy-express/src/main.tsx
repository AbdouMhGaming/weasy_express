import { createRoot } from "react-dom/client";
import App from "./App";
import "./lib/i18n";
import "./index.css";
import "./lib/assetRecovery";
import "./lib/portalUpdatesI18n";
import { ApplicationBoundary } from "./components/ApplicationBoundary";

createRoot(document.getElementById("root")!).render(<ApplicationBoundary><App /></ApplicationBoundary>);
