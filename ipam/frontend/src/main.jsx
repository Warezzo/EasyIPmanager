import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./hooks/useAuth.jsx";
import { ThemeProvider } from "./hooks/useTheme.jsx";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import IPAM from "./pages/IPAM";
import DNS from "./pages/DNS";
import Scanner from "./pages/Scanner";
import SSH from "./pages/SSH";

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{ minHeight: "100vh", background: "var(--bg-base)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-ghost)", fontFamily: "monospace", fontSize: 13 }}>
      Caricamento...
    </div>
  );
  return user ? children : <Navigate to="/login" replace />;
}

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/*" element={
              <PrivateRoute>
                <Layout>
                  <Routes>
                    <Route path="/" element={<IPAM />} />
                    <Route path="/dns" element={<DNS />} />
                    <Route path="/scanner" element={<Scanner />} />
                    <Route path="/ssh" element={<SSH />} />
                  </Routes>
                </Layout>
              </PrivateRoute>
            } />
          </Routes>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

createRoot(document.getElementById("root")).render(<StrictMode><App /></StrictMode>);
