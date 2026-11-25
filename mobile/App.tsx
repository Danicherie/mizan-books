import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { apiFetch, getApiUrl, setApiUrl, setToken } from "./src/api";
import {
  formatDate,
  formatMoney,
  isRtl,
  LANGUAGES,
  MOBILE_TEXT,
  type CalendarSystem,
  type Lang,
} from "./src/i18n";

interface Company {
  id: number;
  name: string;
  base_currency: string;
  plan_name?: string;
  trial_ends_at?: string;
}

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

type Tab = "dashboard" | "invoices" | "bills" | "reports" | "settings";

export default function App() {
  const [lang, setLang] = useState<Lang>("en");
  const [calendar, setCalendar] = useState<CalendarSystem>("gregorian");
  const [user, setUser] = useState<User | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<number>(1);
  const [booting, setBooting] = useState(true);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [refreshing, setRefreshing] = useState(false);

  // Auth form state
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [serverInput, setServerInput] = useState("http://localhost:3000");
  const [email, setEmail] = useState("admin@mizanbooks.com");
  const [password, setPassword] = useState("password123");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Data state
  const [dash, setDash] = useState<any>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [reports, setReports] = useState<any>(null);

  const t = MOBILE_TEXT[lang];
  const rtl = isRtl(lang);
  const activeCompany = companies.find((c) => c.id === companyId) || companies[0];
  const currency = activeCompany?.base_currency || "ETB";

  const loadSession = useCallback(async () => {
    try {
      const url = await getApiUrl();
      setServerInput(url);
      const data = await apiFetch<{ user: User | null; companies: Company[] }>("/api/auth/me");
      setUser(data.user);
      setCompanies(data.companies || []);
      if (data.companies?.length && !data.companies.some((c) => c.id === companyId)) {
        setCompanyId(data.companies[0].id);
      }
    } catch {
      setUser(null);
    } finally {
      setBooting(false);
    }
  }, [companyId]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const loadTabData = useCallback(async () => {
    if (!user || !activeCompany) return;
    setRefreshing(true);
    try {
      const cid = activeCompany.id;
      if (tab === "dashboard") {
        setDash(await apiFetch(`/api/dashboard?companyId=${cid}`));
      } else if (tab === "invoices") {
        const res = await apiFetch<{ invoices: any[] }>(`/api/invoices?companyId=${cid}`);
        setInvoices(res.invoices || []);
      } else if (tab === "bills") {
        const res = await apiFetch<{ bills: any[] }>(`/api/bills?companyId=${cid}`);
        setBills(res.bills || []);
      } else if (tab === "reports") {
        setReports(await apiFetch(`/api/reports?companyId=${cid}`));
      }
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  }, [user, activeCompany, tab]);

  useEffect(() => {
    void loadTabData();
  }, [loadTabData]);

  async function handleAuth(demoEmail?: string) {
    setSubmitting(true);
    try {
      await setApiUrl(serverInput);
      if (demoEmail) {
        const res = await apiFetch<{ token: string }>("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ demoEmail }),
        });
        await setToken(res.token);
      } else if (authMode === "signin") {
        const res = await apiFetch<{ token: string }>("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
        await setToken(res.token);
      } else {
        const res = await apiFetch<{ token: string; company?: Company }>("/api/auth/signup", {
          method: "POST",
          body: JSON.stringify({
            name: fullName,
            email,
            password,
            company_name: companyName,
            base_currency: "ETB",
            tax_regime: "ET_STANDARD",
            preferred_lang: lang,
          }),
        });
        await setToken(res.token);
        if (res.company?.id) setCompanyId(res.company.id);
      }
      await loadSession();
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMarkInvoicePaid(inv: any) {
    const remaining = Number((inv.total - inv.amount_paid).toFixed(2));
    if (remaining <= 0) return;
    try {
      await apiFetch(`/api/invoices/${inv.id}/pay`, {
        method: "POST",
        body: JSON.stringify({
          amount: remaining,
          payment_date: new Date().toISOString().slice(0, 10),
        }),
      });
      await loadTabData();
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : String(err));
    }
  }

  const trialDaysLeft = (() => {
    if (!activeCompany?.trial_ends_at) return 30;
    const ms = new Date(activeCompany.trial_ends_at).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
  })();

  if (booting) {
    return (
      <SafeAreaView style={styles.bootContainer}>
        <StatusBar style="light" />
        <ActivityIndicator color="#10b981" size="large" />
      </SafeAreaView>
    );
  }

  // ===== AUTH SCREEN (SIGN IN + 30-DAY FREE TRIAL SIGN UP) =====
  if (!user) {
    return (
      <SafeAreaView style={styles.authRoot}>
        <StatusBar style="light" />
        <ScrollView contentContainerStyle={styles.authScroll}>
          <View style={[styles.langRow, rtl && styles.rowReverse]}>
            {LANGUAGES.map((l) => (
              <TouchableOpacity
                key={l.code}
                onPress={() => setLang(l.code)}
                style={[styles.langPill, lang === l.code && styles.langPillActive]}
              >
                <Text style={[styles.langText, lang === l.code && styles.langTextActive]}>{l.short}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.brandTitle, rtl && styles.textRight]}>{t.appName}</Text>
          <View style={styles.trialPill}>
            <Text style={styles.trialPillText}>{t.freeTrialBadge}</Text>
          </View>

          <View style={styles.authCard}>
            <View style={[styles.modeRow, rtl && styles.rowReverse]}>
              <TouchableOpacity
                onPress={() => setAuthMode("signin")}
                style={[styles.modeBtn, authMode === "signin" && styles.modeBtnActive]}
              >
                <Text style={[styles.modeText, authMode === "signin" && styles.modeTextActive]}>{t.signIn}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setAuthMode("signup")}
                style={[styles.modeBtn, authMode === "signup" && styles.modeBtnActive]}
              >
                <Text style={[styles.modeText, authMode === "signup" && styles.modeTextActive]}>{t.signUp}</Text>
              </TouchableOpacity>
            </View>

            {authMode === "signup" && (
              <>
                <Text style={[styles.label, rtl && styles.textRight]}>{t.fullName}</Text>
                <TextInput style={[styles.input, rtl && styles.textRight]} value={fullName} onChangeText={setFullName} placeholder="Dawit Alemu" />
                <Text style={[styles.label, rtl && styles.textRight]}>{t.companyName}</Text>
                <TextInput style={[styles.input, rtl && styles.textRight]} value={companyName} onChangeText={setCompanyName} placeholder="Rift Valley Trading PLC" />
              </>
            )}

            <Text style={[styles.label, rtl && styles.textRight]}>{t.email}</Text>
            <TextInput
              style={[styles.input, rtl && styles.textRight]}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <Text style={[styles.label, rtl && styles.textRight]}>{t.password}</Text>
            <TextInput style={[styles.input, rtl && styles.textRight]} value={password} onChangeText={setPassword} secureTextEntry />

            <Text style={[styles.label, rtl && styles.textRight]}>{t.serverUrl}</Text>
            <TextInput style={styles.input} value={serverInput} onChangeText={setServerInput} autoCapitalize="none" />

            <TouchableOpacity
              disabled={submitting}
              onPress={() => void handleAuth()}
              style={styles.primaryBtn}
            >
              <Text style={styles.primaryBtnText}>
                {authMode === "signin" ? t.signIn : t.startTrialBtn}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              disabled={submitting}
              onPress={() => void handleAuth("admin@mizanbooks.com")}
              style={styles.secondaryBtn}
            >
              <Text style={styles.secondaryBtnText}>{t.demoBtn}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ===== MAIN TABBED MOBILE APP =====
  return (
    <SafeAreaView style={styles.appRoot}>
      <StatusBar style="dark" />
      {/* Top Bar */}
      <View style={[styles.topBar, rtl && styles.rowReverse]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.topCompany, rtl && styles.textRight]} numberOfLines={1}>
            {activeCompany?.name}
          </Text>
          <Text style={[styles.topTrial, rtl && styles.textRight]}>
            {trialDaysLeft} {t.daysLeft} · {currency}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => setCalendar(calendar === "gregorian" ? "ethiopian" : "gregorian")}
          style={styles.calChip}
        >
          <Text style={styles.calChipText}>{calendar === "gregorian" ? t.gregorian : t.ethiopian}</Text>
        </TouchableOpacity>
      </View>

      {/* Main Content */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadTabData()} />}
      >
        {tab === "dashboard" && dash && (
          <View style={{ gap: 12 }}>
            <View style={styles.kpiGrid}>
              <View style={styles.kpiCard}>
                <Text style={[styles.kpiLabel, rtl && styles.textRight]}>{t.cash}</Text>
                <Text style={[styles.kpiValue, rtl && styles.textRight]}>{formatMoney(dash.kpis?.cashBalance, currency)}</Text>
              </View>
              <View style={styles.kpiCard}>
                <Text style={[styles.kpiLabel, rtl && styles.textRight]}>{t.receivables}</Text>
                <Text style={[styles.kpiValue, rtl && styles.textRight]}>{formatMoney(dash.kpis?.accountsReceivable, currency)}</Text>
              </View>
              <View style={styles.kpiCard}>
                <Text style={[styles.kpiLabel, rtl && styles.textRight]}>{t.payables}</Text>
                <Text style={[styles.kpiValue, rtl && styles.textRight]}>{formatMoney(dash.kpis?.accountsPayable, currency)}</Text>
              </View>
              <View style={styles.kpiCard}>
                <Text style={[styles.kpiLabel, rtl && styles.textRight]}>{t.netIncome}</Text>
                <Text style={[styles.kpiValue, { color: "#047857" }, rtl && styles.textRight]}>
                  {formatMoney(dash.kpis?.netIncome, currency)}
                </Text>
              </View>
            </View>

            {(dash.recentJournals || []).map((je: any) => (
              <View key={je.id} style={styles.listCard}>
                <View style={[styles.rowBetween, rtl && styles.rowReverse]}>
                  <Text style={styles.monoCode}>{je.entry_number}</Text>
                  <Text style={styles.boldAmt}>{formatMoney(je.total_amount, currency)}</Text>
                </View>
                <Text style={[styles.cardDesc, rtl && styles.textRight]}>{je.description}</Text>
                <Text style={[styles.cardMeta, rtl && styles.textRight]}>{formatDate(je.entry_date, calendar, lang)}</Text>
              </View>
            ))}
          </View>
        )}

        {tab === "invoices" && (
          <View style={{ gap: 10 }}>
            {invoices.map((inv) => {
              const due = Math.max(0, Number((inv.total - inv.amount_paid).toFixed(2)));
              return (
                <View key={inv.id} style={styles.listCard}>
                  <View style={[styles.rowBetween, rtl && styles.rowReverse]}>
                    <Text style={styles.monoCode}>{inv.invoice_number}</Text>
                    <Text style={styles.statusBadge}>{inv.status}</Text>
                  </View>
                  <Text style={[styles.cardTitle, rtl && styles.textRight]}>{inv.customer_name}</Text>
                  <View style={[styles.rowBetween, rtl && styles.rowReverse, { marginTop: 6 }]}>
                    <Text style={styles.cardMeta}>{formatDate(inv.due_date, calendar, lang)}</Text>
                    <Text style={styles.boldAmt}>{formatMoney(inv.total, inv.currency_code)}</Text>
                  </View>
                  {due > 0.01 && (
                    <TouchableOpacity onPress={() => void handleMarkInvoicePaid(inv)} style={styles.payActionBtn}>
                      <Text style={styles.payActionText}>
                        {t.recordPaid} ({formatMoney(due, inv.currency_code)})
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {tab === "bills" && (
          <View style={{ gap: 10 }}>
            {bills.map((b) => (
              <View key={b.id} style={styles.listCard}>
                <View style={[styles.rowBetween, rtl && styles.rowReverse]}>
                  <Text style={styles.monoCode}>{b.bill_number}</Text>
                  <Text style={styles.statusBadge}>{b.status}</Text>
                </View>
                <Text style={[styles.cardTitle, rtl && styles.textRight]}>{b.vendor_name}</Text>
                <View style={[styles.rowBetween, rtl && styles.rowReverse, { marginTop: 6 }]}>
                  <Text style={styles.cardMeta}>{formatDate(b.due_date, calendar, lang)}</Text>
                  <Text style={styles.boldAmt}>{formatMoney(b.total, b.currency_code)}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {tab === "reports" && reports && (
          <View style={{ gap: 12 }}>
            <View style={styles.listCard}>
              <Text style={[styles.sectionHeading, rtl && styles.textRight]}>{t.profitLoss}</Text>
              <View style={[styles.rowBetween, rtl && styles.rowReverse]}>
                <Text style={styles.cardMeta}>{t.totalRevenue}</Text>
                <Text style={styles.boldAmt}>{formatMoney(reports.profitAndLoss?.totalRevenue, currency)}</Text>
              </View>
              <View style={[styles.rowBetween, rtl && styles.rowReverse, { marginTop: 6 }]}>
                <Text style={styles.cardMeta}>{t.totalExpenses}</Text>
                <Text style={styles.boldAmt}>{formatMoney(reports.profitAndLoss?.totalExpenses, currency)}</Text>
              </View>
              <View style={[styles.rowBetween, rtl && styles.rowReverse, styles.dividerTop]}>
                <Text style={styles.cardTitle}>{t.netIncome}</Text>
                <Text style={[styles.boldAmt, { color: "#047857" }]}>
                  {formatMoney(reports.profitAndLoss?.netIncome, currency)}
                </Text>
              </View>
            </View>

            <View style={styles.listCard}>
              <View style={[styles.rowBetween, rtl && styles.rowReverse]}>
                <Text style={styles.sectionHeading}>{t.balanceSheet}</Text>
                {reports.balanceSheet?.balanced && <Text style={styles.balancedPill}>{t.balanced}</Text>}
              </View>
              <View style={[styles.rowBetween, rtl && styles.rowReverse]}>
                <Text style={styles.cardMeta}>{t.totalAssets}</Text>
                <Text style={styles.boldAmt}>{formatMoney(reports.balanceSheet?.totalAssets, currency)}</Text>
              </View>
              <View style={[styles.rowBetween, rtl && styles.rowReverse, { marginTop: 6 }]}>
                <Text style={styles.cardMeta}>{t.totalLiabEq}</Text>
                <Text style={styles.boldAmt}>{formatMoney(reports.balanceSheet?.totalLiabilitiesAndEquity, currency)}</Text>
              </View>
            </View>
          </View>
        )}

        {tab === "settings" && (
          <View style={{ gap: 14 }}>
            <View style={styles.listCard}>
              <Text style={[styles.sectionHeading, rtl && styles.textRight]}>{t.switchCompany}</Text>
              {companies.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => setCompanyId(c.id)}
                  style={[styles.companyOption, c.id === activeCompany?.id && styles.companyOptionActive]}
                >
                  <Text style={styles.cardTitle}>{c.name} ({c.base_currency})</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.listCard}>
              <View style={[styles.langRow, rtl && styles.rowReverse]}>
                {LANGUAGES.map((l) => (
                  <TouchableOpacity
                    key={l.code}
                    onPress={() => setLang(l.code)}
                    style={[styles.langPillLight, lang === l.code && styles.langPillActive]}
                  >
                    <Text style={[styles.langTextLight, lang === l.code && styles.langTextActive]}>{l.short}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <TouchableOpacity
              onPress={async () => {
                await setToken(null);
                setUser(null);
              }}
              style={[styles.primaryBtn, { backgroundColor: "#be123c" }]}
            >
              <Text style={styles.primaryBtnText}>{t.signOut}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Bottom Tab Navigation */}
      <View style={[styles.bottomNav, rtl && styles.rowReverse]}>
        {(["dashboard", "invoices", "bills", "reports", "settings"] as Tab[]).map((key) => (
          <TouchableOpacity key={key} onPress={() => setTab(key)} style={styles.navItem}>
            <Text style={[styles.navText, tab === key && styles.navTextActive]}>{t[key]}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bootContainer: { flex: 1, backgroundColor: "#020617", justifyContent: "center", alignItems: "center" },
  authRoot: { flex: 1, backgroundColor: "#022c22" },
  authScroll: { padding: 20, paddingTop: 32 },
  brandTitle: { fontSize: 28, fontWeight: "800", color: "#ffffff", marginTop: 18 },
  trialPill: {
    alignSelf: "flex-start",
    backgroundColor: "#065f46",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginTop: 8,
    marginBottom: 18,
  },
  trialPillText: { color: "#a7f3d0", fontSize: 12, fontWeight: "700" },
  authCard: { backgroundColor: "#ffffff", borderRadius: 20, padding: 18, gap: 10 },
  modeRow: { flexDirection: "row", backgroundColor: "#f1f5f9", borderRadius: 12, padding: 4, marginBottom: 6 },
  modeBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center" },
  modeBtnActive: { backgroundColor: "#059669" },
  modeText: { fontSize: 13, fontWeight: "700", color: "#475569" },
  modeTextActive: { color: "#ffffff" },
  label: { fontSize: 12, fontWeight: "700", color: "#475569", marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: "#f8fafc",
  },
  primaryBtn: { backgroundColor: "#059669", borderRadius: 12, paddingVertical: 13, alignItems: "center", marginTop: 8 },
  primaryBtnText: { color: "#ffffff", fontWeight: "700", fontSize: 14 },
  secondaryBtn: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  secondaryBtnText: { color: "#0f172a", fontWeight: "700", fontSize: 13 },
  langRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  rowReverse: { flexDirection: "row-reverse" },
  textRight: { textAlign: "right" },
  langPill: { backgroundColor: "#0f172a", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  langPillLight: { backgroundColor: "#f1f5f9", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  langPillActive: { backgroundColor: "#10b981" },
  langText: { color: "#cbd5e1", fontWeight: "700", fontSize: 12 },
  langTextLight: { color: "#334155", fontWeight: "700", fontSize: 12 },
  langTextActive: { color: "#022c22" },
  appRoot: { flex: 1, backgroundColor: "#f8fafc" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    gap: 10,
  },
  topCompany: { fontSize: 16, fontWeight: "800", color: "#0f172a" },
  topTrial: { fontSize: 11, fontWeight: "600", color: "#059669", marginTop: 2 },
  calChip: { backgroundColor: "#ecfdf5", borderWidth: 1, borderColor: "#a7f3d0", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  calChipText: { color: "#065f46", fontSize: 11, fontWeight: "700" },
  scrollArea: { flex: 1 },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  kpiCard: {
    width: "48%",
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  kpiLabel: { fontSize: 11, fontWeight: "700", color: "#64748b", textTransform: "uppercase" },
  kpiValue: { fontSize: 16, fontWeight: "800", color: "#0f172a", marginTop: 6 },
  listCard: { backgroundColor: "#ffffff", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#e2e8f0" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  monoCode: { fontSize: 12, fontWeight: "700", color: "#047857" },
  boldAmt: { fontSize: 14, fontWeight: "800", color: "#0f172a" },
  cardTitle: { fontSize: 15, fontWeight: "700", color: "#0f172a", marginTop: 4 },
  cardDesc: { fontSize: 13, color: "#334155", marginTop: 4 },
  cardMeta: { fontSize: 12, color: "#64748b" },
  statusBadge: { fontSize: 11, fontWeight: "700", color: "#1d4ed8", backgroundColor: "#eff6ff", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
  payActionBtn: { marginTop: 10, backgroundColor: "#ecfdf5", borderColor: "#a7f3d0", borderWidth: 1, borderRadius: 10, paddingVertical: 8, alignItems: "center" },
  payActionText: { color: "#047857", fontWeight: "700", fontSize: 12 },
  sectionHeading: { fontSize: 15, fontWeight: "800", color: "#0f172a", marginBottom: 10 },
  dividerTop: { borderTopWidth: 1, borderTopColor: "#e2e8f0", marginTop: 10, paddingTop: 10 },
  balancedPill: { fontSize: 11, fontWeight: "700", color: "#047857", backgroundColor: "#ecfdf5", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  companyOption: { padding: 10, borderRadius: 10, borderWidth: 1, borderColor: "#e2e8f0", marginTop: 6 },
  companyOptionActive: { borderColor: "#059669", backgroundColor: "#ecfdf5" },
  bottomNav: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  navItem: { flex: 1, alignItems: "center" },
  navText: { fontSize: 11, fontWeight: "600", color: "#64748b" },
  navTextActive: { color: "#059669", fontWeight: "800" },
});
