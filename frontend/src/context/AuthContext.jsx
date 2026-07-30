import { createContext, useContext, useEffect, useState } from "react";
import { login as loginRequest, logout as logoutRequest } from "../services/authService";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem("yasodha_user");
    return stored ? JSON.parse(stored) : null;
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (user) {
      localStorage.setItem("yasodha_user", JSON.stringify(user));
    } else {
      localStorage.removeItem("yasodha_user");
    }
  }, [user]);

  async function login(email, password) {
    setIsLoading(true);
    try {
      const { access_token, refresh_token, user: loggedInUser } = await loginRequest(
        email,
        password
      );
      localStorage.setItem("yasodha_access_token", access_token);
      localStorage.setItem("yasodha_refresh_token", refresh_token);
      setUser(loggedInUser);
      return loggedInUser;
    } finally {
      setIsLoading(false);
    }
  }

  async function logout() {
    await logoutRequest();
    localStorage.removeItem("yasodha_access_token");
    localStorage.removeItem("yasodha_refresh_token");
    setUser(null);
  }

  const value = {
    user,
    isAuthenticated: Boolean(user),
    isLoading,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
