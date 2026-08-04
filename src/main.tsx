import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
// Side-effect import: defines window.DecoNoir. Imported here rather than in a
// <script> tag so it goes through the bundler and ships inside the packaged
// app instead of being a file path that has to survive packaging.
import "./styles/deco-noir.js";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
