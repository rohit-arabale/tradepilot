import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../styles/index.css";
import App, { ErrorBoundary } from "./App";
import { TrpcProvider } from "./lib/trpcProvider";

const rootElement = document.getElementById("root") as HTMLElement;

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <TrpcProvider>
        <App />
      </TrpcProvider>
    </ErrorBoundary>
  </StrictMode>
);
