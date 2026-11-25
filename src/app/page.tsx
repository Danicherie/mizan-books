"use client";

import React from "react";
import { AppProvider, useApp } from "@/components/AppContext";
import { LoginView } from "@/components/LoginView";
import { AppShell } from "@/components/AppShell";

function RootRouter() {
  const { user, loadingAuth, t } = useApp();

  if (loadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-emerald-400 text-sm font-medium">
        {t.common.loading}
      </div>
    );
  }

  return user ? <AppShell /> : <LoginView />;
}

export default function HomePage() {
  return (
    <AppProvider>
      <RootRouter />
    </AppProvider>
  );
}
