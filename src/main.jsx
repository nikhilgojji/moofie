// Import React itself and the browser renderer used to mount the application.
import React from "react";
import ReactDOM from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
// Load the variable font before the app stylesheet so CSS can use it immediately.
import "@fontsource-variable/libre-franklin";
// Import the top-level UI component and the global visual rules it depends on.
import App from "./App";
import "./styles.css";
import "./reference-theme.css";

// Find the empty #root element in index.html and let React control its contents.
ReactDOM.createRoot(document.getElementById("root")).render(
  // StrictMode performs extra development checks without changing production UI.
  <React.StrictMode>
    <App />
    <Analytics />
  </React.StrictMode>,
);
