"use client";

import React, { useEffect } from "react";
import { AppProvider, useApp } from "@/components/AppContext";
import { LoginView } from "@/components/LoginView";
import { AppShell } from "@/components/AppShell";

function RootRouter() {
  const { user, loadingAuth, t } = useApp();

  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    if (params.has("signup")) {
      window.history.replaceState(null, "", "/app");
    }
  }, [user]);

  if (loadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-mb-beige text-mb-cocoa text-sm font-medium">
        {t.common.loading}
      </div>
    );
  }

  return user ? <AppShell /> : <LoginView />;
}

export default function AppPage() {
  return (
    <AppProvider>
      <RootRouter />
    </AppProvider>
  );
}
