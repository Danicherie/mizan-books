import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { fromMinor, toMinor } from "./money";
import { PUBLISHED_PASSWORDS } from "./passwords";
import { computeEmployeePay } from "./payroll-math";
import { addDays, TRIAL_LENGTH_DAYS, trialWindow } from "./subscription";

const MONEY_MINOR_MIGRATION = "2026_11_25_money_minor_units";

/** Columns that used to be floating-point currency amounts. They are now integer cents. */
const MONEY_COLUMNS: Record<string, string[]> = {
  journal_lines: ["debit", "credit", "foreign_amount"],
  customers: ["credit_limit"],
  inventory_items: ["unit_cost", "unit_price"],
  invoices: ["subtotal", "vat_amount", "wht_amount", "total", "amount_paid"],
  invoice_lines: ["unit_price", "line_total"],
  bills: ["subtotal", "vat_amount", "wht_amount", "total", "amount_paid"],
  bill_lines: ["unit_cost", "line_total"],
  employees: ["base_salary", "transport_allowance", "housing_allowance"],
  payroll_runs: ["total_gross", "total_income_tax", "total_employee_pension", "total_employer_pension", "total_net"],
  payroll_items: ["gross_salary", "taxable_income", "income_tax", "employee_pension", "employer_pension", "net_salary"],
};

let _db: DatabaseSync | null = null;

const SUBSCRIPTION_MIGRATION = "2026_11_25_subscription_trial_window";

function hashPw(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export interface DefaultAccountDef {
  code: string;
  name: string;
  name_am: string;
  name_om: string;
  name_so: string;
  name_ar: string;
  type: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
  subtype: string;
  normal_balance: "DEBIT" | "CREDIT";
}

export const STANDARD_COA: DefaultAccountDef[] = [
  // Assets
  {
    code: "1000",
    name: "Cash on Hand",
    name_am: "ጥሬ ገንዘብ በእጅ",
    name_om: "Maallaqa Harkaa",
    name_so: "Lacagta Caddaanka ah",
    name_ar: "النقدية بالصندوق",
    type: "ASSET",
    subtype: "CASH",
    normal_balance: "DEBIT",
  },
  {
    code: "1010",
    name: "Commercial Bank Operating Account",
    name_am: "የንግድ ባንክ ዋና ሂሳብ",
    name_om: "Herrega Baankii Daldalaa",
    name_so: "Xisaabta Bangiga Ganacsiga",
    name_ar: "الحساب البنكي التجاري",
    type: "ASSET",
    subtype: "BANK",
    normal_balance: "DEBIT",
  },
  {
    code: "1100",
    name: "Accounts Receivable",
    name_am: "ተሰብሳቢ ሂሳብ",
    name_om: "Herrega Fudhatamu (AR)",
    name_so: "Xisaabaadka La Sugayo (AR)",
    name_ar: "الذمم المدينة (العملاء)",
    type: "ASSET",
    subtype: "AR",
    normal_balance: "DEBIT",
  },
  {
    code: "1200",
    name: "Inventory Asset",
    name_am: "የንብረት ክምችት",
    name_om: "Qabeenya Kuusaa Meeshaa",
    name_so: "Hantida Bakhaarka",
    name_ar: "المخزون السلعي",
    type: "ASSET",
    subtype: "INVENTORY",
    normal_balance: "DEBIT",
  },
  {
    code: "1300",
    name: "VAT Input Receivable",
    name_am: "ተመላሽ የግዢ ተ.እ.ታ (Input VAT)",
    name_om: "VAT Bittaa Deebi'u",
    name_so: "VAT Iibsashada La Soo Celinayo",
    name_ar: "ضريبة القيمة المضافة - مدخلات",
    type: "ASSET",
    subtype: "TAX_RECEIVABLE",
    normal_balance: "DEBIT",
  },
  {
    code: "1310",
    name: "Withholding Tax Receivable",
    name_am: "ተመላሽ ቅድመ ታክስ (WHT Credit)",
    name_om: "Kireeditii Taaksii Qabamaa",
    name_so: "Deynta Canshuurta WHT",
    name_ar: "رصيد ضريبة الاستقطاع",
    type: "ASSET",
    subtype: "WHT_RECEIVABLE",
    normal_balance: "DEBIT",
  },
  {
    code: "1500",
    name: "Office Equipment & Computers",
    name_am: "የቢሮ ዕቃዎች እና ኮምፒውተሮች",
    name_om: "Meeshaalee Waajjiraa fi Kompiitara",
    name_so: "Qalabka Xafiiska & Kumbuyuutarada",
    name_ar: "الأجهزة والمعدات المكتبية",
    type: "ASSET",
    subtype: "FIXED_ASSET",
    normal_balance: "DEBIT",
  },
  // Liabilities
  {
    code: "2000",
    name: "Accounts Payable",
    name_am: "ተከፋይ ሂሳብ",
    name_om: "Herrega Kaffalamu (AP)",
    name_so: "Xisaabaadka La Bixinayo (AP)",
    name_ar: "الذمم الدائنة (الموردون)",
    type: "LIABILITY",
    subtype: "AP",
    normal_balance: "CREDIT",
  },
  {
    code: "2100",
    name: "VAT Output Payable",
    name_am: "ተከፋይ የሽያጭ ተ.እ.ታ (Output VAT)",
    name_om: "VAT Gurgurtaa Kaffalamu",
    name_so: "VAT Iibka La Bixinayo",
    name_ar: "ضريبة القيمة المضافة - مخرجات",
    type: "LIABILITY",
    subtype: "TAX_PAYABLE",
    normal_balance: "CREDIT",
  },
  {
    code: "2110",
    name: "Withholding Tax Payable",
    name_am: "ተከፋይ ቅድመ ታክስ (WHT)",
    name_om: "Taaksii Qabamaa Kaffalamu",
    name_so: "Canshuurta WHT La Bixinayo",
    name_ar: "ضريبة الاستقطاع المستحقة",
    type: "LIABILITY",
    subtype: "WHT_PAYABLE",
    normal_balance: "CREDIT",
  },
  {
    code: "2200",
    name: "Payroll Income Tax Payable (PAYE)",
    name_am: "ተከፋይ የሰራተኞች የሥራ ግብር",
    name_om: "Taaksii Mindaa Kaffalamu (PAYE)",
    name_so: "Canshuurta Dakhliga Shaqaalaha",
    name_ar: "ضريبة دخل الموظفين المستحقة",
    type: "LIABILITY",
    subtype: "PAYE_PAYABLE",
    normal_balance: "CREDIT",
  },
  {
    code: "2210",
    name: "Pension Contributions Payable",
    name_am: "ተከፋይ የጡረታ መዋጮ",
    name_om: "Buusii Sooramaa Kaffalamu",
    name_so: "Qaaraanka Hawlgabka La Bixinayo",
    name_ar: "اشتراكات التقاعد المستحقة",
    type: "LIABILITY",
    subtype: "PENSION_PAYABLE",
    normal_balance: "CREDIT",
  },
  // Equity
  {
    code: "3000",
    name: "Owner's Share Capital",
    name_am: "የባለቤቶች ካፒታል",
    name_om: "Kaappitaala Abbaa Qabeenyaa",
    name_so: "Raasamaalka Milkiilaha",
    name_ar: "رأس المال المدفوع",
    type: "EQUITY",
    subtype: "CAPITAL",
    normal_balance: "CREDIT",
  },
  {
    code: "3100",
    name: "Retained Earnings",
    name_am: "ያልተከፋፈለ ትርፍ",
    name_om: "Bu'aa Olkaa'ame",
    name_so: "Faa'iidada La Hayo",
    name_ar: "الأرباح المبقاة",
    type: "EQUITY",
    subtype: "RETAINED_EARNINGS",
    normal_balance: "CREDIT",
  },
  // Revenue
  {
    code: "4000",
    name: "Product Sales Revenue",
    name_am: "የእቃ ሽያጭ ገቢ",
    name_om: "Galii Gurgurtaa Meeshaa",
    name_so: "Dakhliga Iibka Alaabta",
    name_ar: "إيرادات مبيعات البضائع",
    type: "REVENUE",
    subtype: "SALES",
    normal_balance: "CREDIT",
  },
  {
    code: "4100",
    name: "Consulting & Service Revenue",
    name_am: "የምክር እና አገልግሎት ገቢ",
    name_om: "Galii Tajaajilaa fi Gorsaa",
    name_so: "Dakhliga Adeegyada & La-talinta",
    name_ar: "إيرادات الخدمات والاستشارات",
    type: "REVENUE",
    subtype: "SERVICE_REVENUE",
    normal_balance: "CREDIT",
  },
  // Expenses
  {
    code: "5000",
    name: "Cost of Goods Sold (COGS)",
    name_am: "የተሸጡ እቃዎች ወጪ (COGS)",
    name_om: "Baasii Meeshaalee Gurguramanii",
    name_so: "Kharashka Alaabta La Iibiyay",
    name_ar: "تكلفة البضاعة المباعة",
    type: "EXPENSE",
    subtype: "COGS",
    normal_balance: "DEBIT",
  },
  {
    code: "6000",
    name: "Salaries & Wages Expense",
    name_am: "የሰራተኞች ደመወዝ ወጪ",
    name_om: "Baasii Mindaa Hojjettootaa",
    name_so: "Kharashka Mushaharka Shaqaalaha",
    name_ar: "مصروف الرواتب والأجور",
    type: "EXPENSE",
    subtype: "PAYROLL_EXPENSE",
    normal_balance: "DEBIT",
  },
  {
    code: "6010",
    name: "Employer Pension Expense (11%)",
    name_am: "የድርጅት የጡረታ መዋጮ ወጪ",
    name_om: "Baasii Soorama Dhaabbataa (11%)",
    name_so: "Kharashka Hawlgabka Shirkadda",
    name_ar: "مصروف مساهمة الشركة في التقاعد",
    type: "EXPENSE",
    subtype: "PENSION_EXPENSE",
    normal_balance: "DEBIT",
  },
  {
    code: "6100",
    name: "Office Rent & Facilities",
    name_am: "የቢሮ ኪራይ ወጪ",
    name_om: "Kiraa Waajjiraa fi Tajaajilaa",
    name_so: "Kirada Xafiiska & Adeegyada",
    name_ar: "إيجار المكتب والمرافق",
    type: "EXPENSE",
    subtype: "OPERATING_EXPENSE",
    normal_balance: "DEBIT",
  },
  {
    code: "6200",
    name: "Telecom, Internet & Utilities",
    name_am: "የቴሌኮም፣ ኢንተርኔት እና መብራት ወጪ",
    name_om: "Baasii Telekoomii, Intarneetii fi Ibsaa",
    name_so: "Isgaarsiinta, Internet-ka & Korontada",
    name_ar: "الاتصالات والإنترنت والمنافع",
    type: "EXPENSE",
    subtype: "OPERATING_EXPENSE",
    normal_balance: "DEBIT",
  },
  {
    code: "6300",
    name: "Logistics, Freight & Customs",
    name_am: "የትራንስፖርት፣ ጭነት እና ጉምሩክ ወጪ",
    name_om: "Baasii Geejjibaa fi Gumurukaa",
    name_so: "Gaadiidka, Raridda & Kastamka",
    name_ar: "الشحن والنقل والتخليص الجمركي",
    type: "EXPENSE",
    subtype: "OPERATING_EXPENSE",
    normal_balance: "DEBIT",
  },
];

export function seedCompanyChartOfAccounts(db: DatabaseSync, companyId: number): Record<string, number> {
  const insertAcct = db.prepare(`
    INSERT INTO accounts (company_id, code, name, name_am, name_om, name_so, name_ar, type, subtype, normal_balance, is_system, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)
  `);
  const map: Record<string, number> = {};
  for (const acc of STANDARD_COA) {
    const res = insertAcct.run(
      companyId,
      acc.code,
      acc.name,
      acc.name_am,
      acc.name_om,
      acc.name_so,
      acc.name_ar,
      acc.type,
      acc.subtype,
      acc.normal_balance
    );
    map[acc.code] = Number(res.lastInsertRowid);
  }
  return map;
}

export function seedCompanyExchangeRates(db: DatabaseSync, companyId: number, baseCurrency: string) {
  const ratesToUsd: Record<string, number> = {
    USD: 1,
    ETB: 124.5,
    SOS: 571.0,
    KES: 129.2,
    SAR: 3.75,
    AED: 3.6725,
    EUR: 0.92,
  };
  const basePerUsd = ratesToUsd[baseCurrency] ?? 1;
  const stmt = db.prepare(`
    INSERT INTO exchange_rates (company_id, currency_code, rate_to_base, updated_at)
    VALUES (?, ?, ?, datetime('now'))
  `);
  for (const [code, perUsd] of Object.entries(ratesToUsd)) {
    // 1 unit of `code` in `baseCurrency` = basePerUsd / perUsd
    const rateToBase = code === baseCurrency ? 1 : Number((basePerUsd / perUsd).toFixed(4));
    stmt.run(companyId, code, rateToBase);
  }
}

function initSchema(db: DatabaseSync) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'accountant',
      preferred_lang TEXT NOT NULL DEFAULT 'en',
      preferred_calendar TEXT NOT NULL DEFAULT 'gregorian',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      legal_name TEXT NOT NULL,
      tin_number TEXT NOT NULL DEFAULT '',
      base_currency TEXT NOT NULL DEFAULT 'ETB',
      country TEXT NOT NULL DEFAULT 'Ethiopia',
      tax_regime TEXT NOT NULL DEFAULT 'ET_STANDARD',
      default_vat_rate REAL NOT NULL DEFAULT 15,
      default_wht_rate REAL NOT NULL DEFAULT 2,
      fiscal_year_start_month INTEGER NOT NULL DEFAULT 7,
      address TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      plan_name TEXT NOT NULL DEFAULT 'FREE_TRIAL',
      subscription_status TEXT NOT NULL DEFAULT 'trial',
      trial_starts_at TEXT NOT NULL DEFAULT (datetime('now')),
      trial_ends_at TEXT NOT NULL DEFAULT (datetime('now', '+30 days')),
      paid_until TEXT,
      subscription_notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS exchange_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      currency_code TEXT NOT NULL,
      rate_to_base REAL NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, currency_code),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      name_am TEXT,
      name_om TEXT,
      name_so TEXT,
      name_ar TEXT,
      type TEXT NOT NULL,
      subtype TEXT NOT NULL DEFAULT 'OTHER',
      normal_balance TEXT NOT NULL DEFAULT 'DEBIT',
      is_system INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      UNIQUE(company_id, code),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS journal_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      entry_number TEXT NOT NULL,
      entry_date TEXT NOT NULL,
      reference TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'MANUAL',
      source_id INTEGER,
      status TEXT NOT NULL DEFAULT 'POSTED',
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS journal_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      journal_entry_id INTEGER NOT NULL,
      account_id INTEGER NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      debit INTEGER NOT NULL DEFAULT 0,
      credit INTEGER NOT NULL DEFAULT 0,
      currency_code TEXT NOT NULL DEFAULT 'ETB',
      exchange_rate REAL NOT NULL DEFAULT 1,
      foreign_amount INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE,
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      tin_number TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      currency_code TEXT NOT NULL DEFAULT 'ETB',
      credit_limit INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS vendors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      tin_number TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      currency_code TEXT NOT NULL DEFAULT 'ETB',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS inventory_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      sku TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'General',
      item_type TEXT NOT NULL DEFAULT 'PRODUCT',
      unit TEXT NOT NULL DEFAULT 'pcs',
      unit_cost INTEGER NOT NULL DEFAULT 0,
      unit_price INTEGER NOT NULL DEFAULT 0,
      quantity_on_hand REAL NOT NULL DEFAULT 0,
      reorder_level REAL NOT NULL DEFAULT 5,
      income_account_id INTEGER,
      cogs_account_id INTEGER,
      inventory_account_id INTEGER,
      active INTEGER NOT NULL DEFAULT 1,
      UNIQUE(company_id, sku),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      invoice_number TEXT NOT NULL,
      customer_id INTEGER NOT NULL,
      issue_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      currency_code TEXT NOT NULL DEFAULT 'ETB',
      exchange_rate REAL NOT NULL DEFAULT 1,
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat_rate REAL NOT NULL DEFAULT 15,
      vat_amount INTEGER NOT NULL DEFAULT 0,
      wht_rate REAL NOT NULL DEFAULT 0,
      wht_amount INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      amount_paid INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'SENT',
      notes TEXT NOT NULL DEFAULT '',
      journal_entry_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    CREATE TABLE IF NOT EXISTS invoice_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      item_id INTEGER,
      description TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 1,
      unit_price INTEGER NOT NULL DEFAULT 0,
      line_total INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      bill_number TEXT NOT NULL,
      vendor_id INTEGER NOT NULL,
      issue_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      currency_code TEXT NOT NULL DEFAULT 'ETB',
      exchange_rate REAL NOT NULL DEFAULT 1,
      expense_account_id INTEGER NOT NULL,
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat_rate REAL NOT NULL DEFAULT 15,
      vat_amount INTEGER NOT NULL DEFAULT 0,
      wht_rate REAL NOT NULL DEFAULT 0,
      wht_amount INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      amount_paid INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'OPEN',
      notes TEXT NOT NULL DEFAULT '',
      journal_entry_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (vendor_id) REFERENCES vendors(id)
    );

    CREATE TABLE IF NOT EXISTS bill_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id INTEGER NOT NULL,
      item_id INTEGER,
      description TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 1,
      unit_cost INTEGER NOT NULL DEFAULT 0,
      line_total INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      employee_code TEXT NOT NULL,
      full_name TEXT NOT NULL,
      job_title TEXT NOT NULL DEFAULT '',
      department TEXT NOT NULL DEFAULT '',
      tin_number TEXT NOT NULL DEFAULT '',
      base_salary INTEGER NOT NULL DEFAULT 0,
      transport_allowance INTEGER NOT NULL DEFAULT 0,
      housing_allowance INTEGER NOT NULL DEFAULT 0,
      bank_account TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      hire_date TEXT NOT NULL DEFAULT '2025-01-01',
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS payroll_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      period_label TEXT NOT NULL,
      pay_date TEXT NOT NULL,
      total_gross INTEGER NOT NULL DEFAULT 0,
      total_income_tax INTEGER NOT NULL DEFAULT 0,
      total_employee_pension INTEGER NOT NULL DEFAULT 0,
      total_employer_pension INTEGER NOT NULL DEFAULT 0,
      total_net INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'POSTED',
      journal_entry_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS payroll_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payroll_run_id INTEGER NOT NULL,
      employee_id INTEGER NOT NULL,
      gross_salary INTEGER NOT NULL DEFAULT 0,
      taxable_income INTEGER NOT NULL DEFAULT 0,
      income_tax INTEGER NOT NULL DEFAULT 0,
      employee_pension INTEGER NOT NULL DEFAULT 0,
      employer_pension INTEGER NOT NULL DEFAULT 0,
      net_salary INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE,
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      user_id INTEGER,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      details TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS operator_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      company_id INTEGER,
      details TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS company_users (
      company_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'accountant',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (company_id, user_id),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS bank_statements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      account_id INTEGER NOT NULL,
      statement_date TEXT NOT NULL,
      description TEXT NOT NULL,
      reference TEXT NOT NULL DEFAULT '',
      amount INTEGER NOT NULL,
      matched_journal_line_id INTEGER,
      status TEXT NOT NULL DEFAULT 'UNMATCHED',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      account_id INTEGER NOT NULL,
      period_month TEXT NOT NULL,
      budget_amount INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      UNIQUE(company_id, account_id, period_month),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS pos_sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      receipt_number TEXT NOT NULL,
      sale_date TEXT NOT NULL,
      customer_name TEXT NOT NULL DEFAULT 'Walk-in Customer',
      payment_method TEXT NOT NULL DEFAULT 'CASH',
      subtotal INTEGER NOT NULL DEFAULT 0,
      vat_rate REAL NOT NULL DEFAULT 15,
      vat_amount INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      journal_entry_id INTEGER,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS pos_sale_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pos_sale_id INTEGER NOT NULL,
      item_id INTEGER,
      description TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 1,
      unit_price INTEGER NOT NULL DEFAULT 0,
      line_total INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (pos_sale_id) REFERENCES pos_sales(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS payment_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      provider TEXT NOT NULL,
      purpose TEXT NOT NULL,
      reference_id INTEGER,
      tx_ref TEXT NOT NULL UNIQUE,
      currency_code TEXT NOT NULL DEFAULT 'ETB',
      amount INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'PENDING',
      checkout_url TEXT NOT NULL DEFAULT '',
      mode TEXT NOT NULL DEFAULT 'SANDBOX',
      meta_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notification_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      channel TEXT NOT NULL,
      recipient TEXT NOT NULL,
      entity_type TEXT NOT NULL DEFAULT 'INVOICE',
      entity_id INTEGER,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'SIMULATED',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );
  `);

  // Safe migration for existing SQLite databases created before trial/subscription/alert/receipt columns
  const cols = db.prepare("PRAGMA table_info(companies)").all() as Array<{ name: string }>;
  const colNames = new Set(cols.map((c) => c.name));
  if (!colNames.has("plan_name")) {
    db.exec("ALTER TABLE companies ADD COLUMN plan_name TEXT NOT NULL DEFAULT 'FREE_TRIAL'");
  }
  if (!colNames.has("subscription_status")) {
    db.exec("ALTER TABLE companies ADD COLUMN subscription_status TEXT NOT NULL DEFAULT 'TRIALING'");
  }
  if (!colNames.has("trial_starts_at")) {
    db.exec("ALTER TABLE companies ADD COLUMN trial_starts_at TEXT NOT NULL DEFAULT ''");
    db.exec("UPDATE companies SET trial_starts_at = datetime('now') WHERE trial_starts_at = ''");
  }
  if (!colNames.has("trial_ends_at")) {
    db.exec("ALTER TABLE companies ADD COLUMN trial_ends_at TEXT NOT NULL DEFAULT ''");
    db.exec("UPDATE companies SET trial_ends_at = datetime('now', '+30 days') WHERE trial_ends_at = ''");
  }
  if (!colNames.has("telegram_chat_id")) {
    db.exec("ALTER TABLE companies ADD COLUMN telegram_chat_id TEXT NOT NULL DEFAULT ''");
  }
  if (!colNames.has("sms_sender_id")) {
    db.exec("ALTER TABLE companies ADD COLUMN sms_sender_id TEXT NOT NULL DEFAULT 'MizanBooks'");
  }

  const billCols = db.prepare("PRAGMA table_info(bills)").all() as Array<{ name: string }>;
  if (!billCols.some((c) => c.name === "receipt_filename")) {
    db.exec("ALTER TABLE bills ADD COLUMN receipt_filename TEXT NOT NULL DEFAULT ''");
  }

  // Seed sample budgets & bank statement rows for demo company #1 if empty
  const demoComp = db.prepare("SELECT id FROM companies WHERE name = 'Addis Horizon Trading PLC' LIMIT 1").get() as
    | { id: number }
    | undefined;
  if (demoComp) {
    const bCount = (db.prepare("SELECT COUNT(*) as c FROM budgets WHERE company_id = ?").get(demoComp.id) as { c: number }).c;
    if (bCount === 0) {
      const acctRows = db
        .prepare("SELECT id, code FROM accounts WHERE company_id = ? AND code IN ('4000','4100','5000','6000','6100','6200','6300')")
        .all(demoComp.id) as Array<{ id: number; code: string }>;
      const byCode = Object.fromEntries(acctRows.map((a) => [a.code, a.id]));
      const monthKey = new Date().toISOString().slice(0, 7);
      const insB = db.prepare("INSERT OR IGNORE INTO budgets (company_id, account_id, period_month, budget_amount, notes) VALUES (?, ?, ?, ?, ?)");
      const defaults: Array<[string, number, string]> = [
        ["4000", 85000000, "Monthly product sales target"],
        ["4100", 22000000, "ERP & advisory services target"],
        ["5000", 48000000, "Estimated cost of sales"],
        ["6000", 13000000, "Monthly payroll budget"],
        ["6100", 7000000, "HQ office rent & facilities"],
        ["6200", 3500000, "Fiber internet & telecom"],
        ["6300", 10000000, "Freight & customs corridor"],
      ];
      for (const [code, amt, note] of defaults) {
        if (byCode[code]) insB.run(demoComp.id, byCode[code], monthKey, amt, note);
      }
    }

    const bsCount = (db.prepare("SELECT COUNT(*) as c FROM bank_statements WHERE company_id = ?").get(demoComp.id) as { c: number }).c;
    if (bsCount === 0) {
      const bankAcc = db
        .prepare("SELECT id FROM accounts WHERE company_id = ? AND code = '1010' LIMIT 1")
        .get(demoComp.id) as { id: number } | undefined;
      if (bankAcc) {
        const insStmt = db.prepare(`
          INSERT INTO bank_statements (company_id, account_id, statement_date, description, reference, amount, status)
          VALUES (?, ?, ?, ?, ?, ?, 'UNMATCHED')
        `);
        insStmt.run(demoComp.id, bankAcc.id, "2026-09-25", "CBE Transfer - Awash Specialty Coffee", "PAY-INV-001", 59890000);
        insStmt.run(demoComp.id, bankAcc.id, "2026-10-15", "RTGS Outgoing - Bole Business Tower", "PAY-BILL-001", -13560000);
        insStmt.run(demoComp.id, bankAcc.id, "2026-10-18", "CBE Deposit - Oromia Tech Partial", "PAY-INV-002", 25000000);
        insStmt.run(demoComp.id, bankAcc.id, "2026-10-31", "Monthly Bank Maintenance & SMS Fee", "BANK-FEE-10", -45000);
      }
    }
  }

  // Backfill company_users memberships for existing databases cleanly
  const cuCount = (db.prepare("SELECT COUNT(*) as c FROM company_users").get() as { c: number }).c;
  if (cuCount === 0) {
    const demoUsers = db
      .prepare("SELECT id, role FROM users WHERE email IN ('admin@mizanbooks.com', 'accountant@mizanbooks.com', 'viewer@mizanbooks.com')")
      .all() as Array<{ id: number; role: string }>;
    const demoCompanies = db
      .prepare("SELECT id FROM companies WHERE name IN ('Addis Horizon Trading PLC', 'Horn Logistics & Supply LLC')")
      .all() as Array<{ id: number }>;

    const insMem = db.prepare("INSERT OR IGNORE INTO company_users (company_id, user_id, role) VALUES (?, ?, ?)");
    for (const u of demoUsers) {
      for (const c of demoCompanies) {
        insMem.run(c.id, u.id, u.role);
      }
    }

    // Link any non-demo signed-up users to companies matching their email
    const otherUsers = db
      .prepare("SELECT id, email, role FROM users WHERE email NOT IN ('admin@mizanbooks.com', 'accountant@mizanbooks.com', 'viewer@mizanbooks.com')")
      .all() as Array<{ id: number; email: string; role: string }>;
    for (const u of otherUsers) {
      const owned = db
        .prepare("SELECT id FROM companies WHERE lower(email) = lower(?)")
        .all(u.email) as Array<{ id: number }>;
      for (const c of owned) {
        insMem.run(c.id, u.id, u.role);
      }
    }
  }

  applySubscriptionMigration(db);
  applyContactMigration(db);
}

const CONTACT_MIGRATION = "2026_11_25_contact_messages";

function applyContactMigration(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS contact_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      message TEXT NOT NULL,
      read_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  const done = db.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(CONTACT_MIGRATION) as
    | { id: string }
    | undefined;
  if (done) return;
  db.prepare("INSERT INTO schema_migrations (id) VALUES (?)").run(CONTACT_MIGRATION);
}

function applySubscriptionMigration(db: DatabaseSync) {
  const cols = db.prepare("PRAGMA table_info(companies)").all() as Array<{ name: string }>;
  const colNames = new Set(cols.map((c) => c.name));
  if (!colNames.has("paid_until")) {
    db.exec("ALTER TABLE companies ADD COLUMN paid_until TEXT");
  }
  if (!colNames.has("subscription_notes")) {
    db.exec("ALTER TABLE companies ADD COLUMN subscription_notes TEXT NOT NULL DEFAULT ''");
  }

  const done = db.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(SUBSCRIPTION_MIGRATION) as
    | { id: string }
    | undefined;
  if (done) return;

  const now = new Date();
  const starts = now.toISOString();
  const ends = addDays(now, TRIAL_LENGTH_DAYS).toISOString();
  db.prepare(
    `UPDATE companies
     SET subscription_status = 'trial',
         trial_starts_at = ?,
         trial_ends_at = ?,
         plan_name = CASE WHEN plan_name IS NULL OR plan_name = '' THEN 'FREE_TRIAL' ELSE plan_name END
     WHERE paid_until IS NULL OR trim(paid_until) = '' OR paid_until <= ?`
  ).run(starts, ends, starts);
  db.prepare("INSERT INTO schema_migrations (id) VALUES (?)").run(SUBSCRIPTION_MIGRATION);
}

function columnNeedsMinorConversion(declaredType: string): boolean {
  return !declaredType.toUpperCase().includes("INT");
}

function rewriteCreateSql(sql: string, table: string, moneyColumns: string[]): string {
  const renamed = sql.replace(
    new RegExp(`(CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?)(["'\`]?)${table}\\2`, "i"),
    `$1$2${table}__minor$2`
  );
  if (!renamed.includes(`${table}__minor`)) {
    throw new Error(`Could not prepare the money migration for ${table}.`);
  }
  let out = renamed;
  for (const column of moneyColumns) {
    out = out.replace(new RegExp(`(\\b${column}\\s+)REAL\\b`, "gi"), "$1INTEGER");
  }
  return out;
}

function migrateMoneyToMinorUnits(db: DatabaseSync) {
  const done = db.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(MONEY_MINOR_MIGRATION) as
    | { id: string }
    | undefined;
  if (done) return;

  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const [table, moneyColumns] of Object.entries(MONEY_COLUMNS)) {
      const info = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string; type: string }>;
      if (info.length === 0) continue;
      const money = new Set(moneyColumns);
      const needs = moneyColumns.some((column) => {
        const found = info.find((col) => col.name === column);
        return found ? columnNeedsMinorConversion(found.type) : false;
      });
      if (!needs) continue;

      const master = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) as
        | { sql: string }
        | undefined;
      if (!master?.sql) throw new Error(`Missing table definition for ${table}.`);
      db.exec(`DROP TABLE IF EXISTS ${table}__minor`);
      db.exec(rewriteCreateSql(master.sql, table, moneyColumns));

      const names = info.map((col) => col.name);
      const insert = db.prepare(
        `INSERT INTO ${table}__minor (${names.join(", ")}) VALUES (${names.map(() => "?").join(", ")})`
      );
      const rows = db.prepare(`SELECT * FROM ${table}`).all() as Array<Record<string, unknown>>;
      for (const row of rows) {
        const values: SQLInputValue[] = names.map((name) => {
          const value = row[name];
          if (!money.has(name) || value == null) {
            if (value == null) return null;
            if (typeof value === "number" || typeof value === "string" || typeof value === "bigint" || value instanceof Uint8Array) {
              return value;
            }
            throw new Error(`Cannot copy ${table}.${name} while converting money columns.`);
          }
          return toMinor(typeof value === "bigint" ? Number(value) : (value as number | string));
        });
        insert.run(...values);
      }
      db.exec(`DROP TABLE ${table}`);
      db.exec(`ALTER TABLE ${table}__minor RENAME TO ${table}`);
    }
    db.prepare("INSERT INTO schema_migrations (id) VALUES (?)").run(MONEY_MINOR_MIGRATION);
    db.exec("COMMIT");
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // Keep the original migration error.
    }
    throw err;
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}

function isDemoMode(): boolean {
  return process.env.ENABLE_DEMO_LOGIN === "true";
}

function bootstrapDatabase(db: DatabaseSync) {
  const userCount = (db.prepare("SELECT COUNT(*) as c FROM users").get() as { c: number }).c;
  if (userCount > 0) return;

  db.exec("BEGIN IMMEDIATE");
  try {
    if (isDemoMode()) {
      if ((process.env.INITIAL_ADMIN_EMAIL ?? "").trim() || (process.env.INITIAL_ADMIN_PASSWORD ?? "").trim()) {
        console.warn("[Mizan Books] ENABLE_DEMO_LOGIN=true, so sample companies are created and INITIAL_ADMIN_EMAIL is not used.");
      }
      if (process.env.NODE_ENV === "production") {
        console.warn(
          "[Mizan Books] ENABLE_DEMO_LOGIN=true. Sample users with the published demo password will be created. Do not use this for a real company's books."
        );
      }
      seedDemoData(db);
    } else {
      createInitialAdmin(db);
    }
    db.exec("COMMIT");
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // Keep the original error.
    }
    throw err;
  }
}

function createInitialAdmin(db: DatabaseSync) {
  const email = (process.env.INITIAL_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD ?? "";
  const name = (process.env.INITIAL_ADMIN_NAME ?? "").trim() || "Administrator";
  const companyName = (process.env.INITIAL_COMPANY_NAME ?? "").trim();
  if (!email && !password && !companyName) return;
  if (!email || !password) {
    throw new Error(
      "To create the first administrator, set both INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD. Leave both unset to use the sign-up page instead."
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("INITIAL_ADMIN_EMAIL must be a valid email address.");
  }
  if (password.length < 12 || PUBLISHED_PASSWORDS.has(password)) {
    throw new Error(
      "INITIAL_ADMIN_PASSWORD must be at least 12 characters and must not be a published sample password."
    );
  }

  const userId = Number(
    db
      .prepare(
        `INSERT INTO users (name, email, password_hash, role, preferred_lang, preferred_calendar) VALUES (?, ?, ?, 'admin', 'en', 'gregorian')`
      )
      .run(name, email, hashPw(password)).lastInsertRowid
  );

  if (!companyName) return;
  const currency = (process.env.INITIAL_COMPANY_CURRENCY ?? "").trim() || "ETB";
  const trial = trialWindow();
  const companyId = Number(
    db
      .prepare(
        `INSERT INTO companies (
           name, legal_name, base_currency, email, plan_name, subscription_status, trial_starts_at, trial_ends_at
         ) VALUES (?, ?, ?, ?, 'FREE_TRIAL', 'trial', ?, ?)`
      )
      .run(companyName, companyName, currency, email, trial.trialStartsAt, trial.trialEndsAt).lastInsertRowid
  );
  seedCompanyChartOfAccounts(db, companyId);
  seedCompanyExchangeRates(db, companyId, currency);
  db.prepare("INSERT INTO company_users (company_id, user_id, role) VALUES (?, ?, 'admin')").run(companyId, userId);
}

/** Sample companies and the published demo password. Runs only when ENABLE_DEMO_LOGIN=true. */
function seedDemoData(db: DatabaseSync) {
  // 1. Users
  const insUser = db.prepare(`
    INSERT INTO users (name, email, password_hash, role, preferred_lang, preferred_calendar)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const adminId = Number(
    insUser.run("Abebe Bekele", "admin@mizanbooks.com", hashPw("password123"), "admin", "en", "gregorian")
      .lastInsertRowid
  );
  const accountantId = Number(
    insUser.run("Fatima Al-Mansoor", "accountant@mizanbooks.com", hashPw("password123"), "accountant", "ar", "gregorian")
      .lastInsertRowid
  );
  const viewerId = Number(
    insUser.run("Abdirahman Hassan", "viewer@mizanbooks.com", hashPw("password123"), "viewer", "so", "gregorian")
      .lastInsertRowid
  );

  // 2. Companies
  const insComp = db.prepare(`
    INSERT INTO companies (name, legal_name, tin_number, base_currency, country, tax_regime, default_vat_rate, default_wht_rate, fiscal_year_start_month, address, phone, email)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const comp1Id = Number(
    insComp.run(
      "Addis Horizon Trading PLC",
      "Addis Horizon General Trading Private Limited Company",
      "0048291734",
      "ETB",
      "Ethiopia",
      "ET_STANDARD",
      15,
      2,
      7,
      "Bole Sub-City, Woreda 03, Addis Ababa, Ethiopia",
      "+251 11 662 4810",
      "finance@addishorizon.et"
    ).lastInsertRowid
  );

  const comp2Id = Number(
    insComp.run(
      "Horn Logistics & Supply LLC",
      "Horn of Africa Logistics & Commercial Supply LLC",
      "TRN-100492817200003",
      "USD",
      "United Arab Emirates",
      "UAE_VAT",
      5,
      0,
      1,
      "Business Bay Tower 4, Dubai, UAE / Mogadishu Branch",
      "+971 4 388 9210",
      "accounts@hornlogistics.ae"
    ).lastInsertRowid
  );

  const coa1 = seedCompanyChartOfAccounts(db, comp1Id);
  const coa2 = seedCompanyChartOfAccounts(db, comp2Id);
  seedCompanyExchangeRates(db, comp1Id, "ETB");
  seedCompanyExchangeRates(db, comp2Id, "USD");

  // Link demo users to demo companies
  const insCU = db.prepare("INSERT OR IGNORE INTO company_users (company_id, user_id, role) VALUES (?, ?, ?)");
  for (const cid of [comp1Id, comp2Id]) {
    insCU.run(cid, adminId, "admin");
    insCU.run(cid, accountantId, "accountant");
    insCU.run(cid, viewerId, "viewer");
  }

  // Helper to post seeded balanced journal entries
  const insJE = db.prepare(`
    INSERT INTO journal_entries (company_id, entry_number, entry_date, reference, description, source_type, source_id, status, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'POSTED', ?)
  `);
  const insJL = db.prepare(`
    INSERT INTO journal_lines (journal_entry_id, account_id, description, debit, credit, currency_code, exchange_rate, foreign_amount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  function addJE(
    companyId: number,
    num: string,
    date: string,
    ref: string,
    desc: string,
    sourceType: string,
    sourceId: number | null,
    currency: string,
    lines: Array<{ acc: number; desc: string; debit: number; credit: number }>
  ): number {
    const jeId = Number(insJE.run(companyId, num, date, ref, desc, sourceType, sourceId, adminId).lastInsertRowid);
    for (const l of lines) {
      const debit = toMinor(l.debit);
      const credit = toMinor(l.credit);
      insJL.run(jeId, l.acc, l.desc, debit, credit, currency, 1, debit || credit);
    }
    return jeId;
  }

  // ===== COMPANY 1 SEED DATA (Addis Horizon Trading PLC - ETB) =====
  // Opening capital & inventory funding
  addJE(comp1Id, "JE-2026-0001", "2026-08-01", "OPEN-CAP", "Initial paid-up share capital and opening bank balance", "MANUAL", null, "ETB", [
    { acc: coa1["1010"], desc: "Commercial Bank opening deposit", debit: 2500000, credit: 0 },
    { acc: coa1["1000"], desc: "Petty cash float", debit: 150000, credit: 0 },
    { acc: coa1["1200"], desc: "Opening inventory valuation", debit: 850000, credit: 0 },
    { acc: coa1["1500"], desc: "Office computers & ERP hardware", debit: 300000, credit: 0 },
    { acc: coa1["3000"], desc: "Owner's Share Capital", debit: 0, credit: 3800000 },
  ]);

  // Customers for Company 1
  const insCust = db.prepare(`
    INSERT INTO customers (company_id, name, email, phone, tin_number, address, currency_code, credit_limit)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const c1 = Number(insCust.run(comp1Id, "Awash Specialty Coffee Exporters", "ap@awashcoffee.et", "+251 11 551 2201", "0019283741", "Kirkos Sub-City, Addis Ababa", "ETB", toMinor(1500000)).lastInsertRowid);
  const c2 = Number(insCust.run(comp1Id, "Oromia Tech & Agri Systems", "finance@oromiatech.et", "+251 22 111 4509", "0028374612", "Adama Industrial Park, Oromia", "ETB", toMinor(900000)).lastInsertRowid);
  const c3 = Number(insCust.run(comp1Id, "Banadir Commercial Distributors", "billing@banadirtrade.so", "+252 61 555 0194", "SO-884210", "Bakara Commercial District, Mogadishu", "USD", toMinor(500000)).lastInsertRowid);
  const c4 = Number(insCust.run(comp1Id, "Al-Noor Trading Establishment", "procurement@alnoor-ksa.sa", "+966 11 452 8890", "310482910400003", "Olaya District, Riyadh, KSA", "SAR", toMinor(1200000)).lastInsertRowid);

  // Vendors for Company 1
  const insVend = db.prepare(`
    INSERT INTO vendors (company_id, name, email, phone, tin_number, address, currency_code)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const v1 = Number(insVend.run(comp1Id, "Bole Business Tower Properties", "lease@boletower.et", "+251 11 667 1100", "0038291002", "Bole Road, Addis Ababa", "ETB").lastInsertRowid);
  const v2 = Number(insVend.run(comp1Id, "Ethio Telecom Enterprise", "enterprise@ethiotelecom.et", "+251 11 551 5777", "0000012345", "Churchill Ave, Addis Ababa", "ETB").lastInsertRowid);
  const v3 = Number(insVend.run(comp1Id, "Red Sea Freight & Clearing", "ops@redseafreight.dj", "+253 21 35 44 10", "DJ-449102", "Port of Djibouti Corridor", "ETB").lastInsertRowid);

  // Inventory items for Company 1
  const insItem = db.prepare(`
    INSERT INTO inventory_items (company_id, sku, name, category, item_type, unit, unit_cost, unit_price, quantity_on_hand, reorder_level, income_account_id, cogs_account_id, inventory_account_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const i1 = Number(insItem.run(comp1Id, "COF-YRG-50", "Yirgacheffe Grade-1 Coffee (50kg Bag)", "Commodities", "PRODUCT", "bag", toMinor(18000), toMinor(26500), 28, 10, coa1["4000"], coa1["5000"], coa1["1200"]).lastInsertRowid);
  const i2 = Number(insItem.run(comp1Id, "SOL-INV-5K", "Hybrid Solar Inverter 5kW", "Energy", "PRODUCT", "unit", toMinor(65000), toMinor(92000), 4, 6, coa1["4000"], coa1["5000"], coa1["1200"]).lastInsertRowid);
  const i3 = Number(insItem.run(comp1Id, "POS-SCN-01", "Wireless Barcode & Fiscal Scanner", "Hardware", "PRODUCT", "unit", toMinor(8500), toMinor(14500), 3, 5, coa1["4000"], coa1["5000"], coa1["1200"]).lastInsertRowid);
  const i4 = Number(insItem.run(comp1Id, "SRV-ERP-01", "ERP & Accounting Setup Consulting", "Services", "SERVICE", "day", toMinor(0), toMinor(18000), 0, 0, coa1["4100"], coa1["5000"], coa1["1200"]).lastInsertRowid);

  // Invoices for Company 1
  const insInv = db.prepare(`
    INSERT INTO invoices (company_id, invoice_number, customer_id, issue_date, due_date, currency_code, exchange_rate, subtotal, vat_rate, vat_amount, wht_rate, wht_amount, total, amount_paid, status, notes, journal_entry_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insInvLine = db.prepare(`
    INSERT INTO invoice_lines (invoice_id, item_id, description, quantity, unit_price, line_total)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  // Invoice 1 - PAID (Sept 2026)
  const inv1Sub = 530000;
  const inv1Vat = 79500;
  const inv1Wht = 10600;
  const inv1Net = inv1Sub + inv1Vat - inv1Wht; // 598900
  const inv1Je = addJE(comp1Id, "JE-2026-0002", "2026-09-12", "INV-2026-001", "Sales Invoice INV-2026-001 - Awash Specialty Coffee Exporters", "INVOICE", null, "ETB", [
    { acc: coa1["1100"], desc: "AR - Awash Specialty Coffee", debit: inv1Net, credit: 0 },
    { acc: coa1["1310"], desc: "2% WHT withheld by customer", debit: inv1Wht, credit: 0 },
    { acc: coa1["4000"], desc: "Product sales revenue", debit: 0, credit: inv1Sub },
    { acc: coa1["2100"], desc: "15% Output VAT", debit: 0, credit: inv1Vat },
    { acc: coa1["5000"], desc: "COGS - 20 bags coffee", debit: 360000, credit: 0 },
    { acc: coa1["1200"], desc: "Inventory reduction", debit: 0, credit: 360000 },
  ]);
  const inv1Id = Number(insInv.run(comp1Id, "INV-2026-001", c1, "2026-09-12", "2026-10-12", "ETB", 1, toMinor(inv1Sub), 15, toMinor(inv1Vat), 2, toMinor(inv1Wht), toMinor(inv1Net), toMinor(inv1Net), "PAID", "Delivered via Addis warehouse", inv1Je).lastInsertRowid);
  insInvLine.run(inv1Id, i1, "Yirgacheffe Grade-1 Coffee (50kg Bag)", 20, toMinor(26500), toMinor(530000));
  addJE(comp1Id, "JE-2026-0003", "2026-09-25", "PAY-INV-001", "Payment received for INV-2026-001", "INVOICE_PAYMENT", inv1Id, "ETB", [
    { acc: coa1["1010"], desc: "Bank deposit - Awash Coffee", debit: inv1Net, credit: 0 },
    { acc: coa1["1100"], desc: "Clear AR INV-2026-001", debit: 0, credit: inv1Net },
  ]);

  // Invoice 2 - PARTIAL (Oct 2026)
  const inv2Sub = 368000;
  const inv2Vat = 55200;
  const inv2Wht = 7360;
  const inv2Net = inv2Sub + inv2Vat - inv2Wht; // 415840
  const inv2Je = addJE(comp1Id, "JE-2026-0004", "2026-10-10", "INV-2026-002", "Sales Invoice INV-2026-002 - Oromia Tech & Agri Systems", "INVOICE", null, "ETB", [
    { acc: coa1["1100"], desc: "AR - Oromia Tech", debit: inv2Net, credit: 0 },
    { acc: coa1["1310"], desc: "2% WHT withheld by customer", debit: inv2Wht, credit: 0 },
    { acc: coa1["4000"], desc: "Solar Inverter sales", debit: 0, credit: inv2Sub },
    { acc: coa1["2100"], desc: "15% Output VAT", debit: 0, credit: inv2Vat },
    { acc: coa1["5000"], desc: "COGS - 4 Solar Inverters", debit: 260000, credit: 0 },
    { acc: coa1["1200"], desc: "Inventory reduction", debit: 0, credit: 260000 },
  ]);
  const inv2Id = Number(insInv.run(comp1Id, "INV-2026-002", c2, "2026-10-10", "2026-11-09", "ETB", 1, toMinor(inv2Sub), 15, toMinor(inv2Vat), 2, toMinor(inv2Wht), toMinor(inv2Net), toMinor(250000), "PARTIAL", "50% advance received, balance upon commissioning", inv2Je).lastInsertRowid);
  insInvLine.run(inv2Id, i2, "Hybrid Solar Inverter 5kW", 4, toMinor(92000), toMinor(368000));
  addJE(comp1Id, "JE-2026-0005", "2026-10-18", "PAY-INV-002", "Partial payment received for INV-2026-002", "INVOICE_PAYMENT", inv2Id, "ETB", [
    { acc: coa1["1010"], desc: "Bank deposit - Oromia Tech", debit: 250000, credit: 0 },
    { acc: coa1["1100"], desc: "Partial AR INV-2026-002", debit: 0, credit: 250000 },
  ]);

  // Invoice 3 - SENT (Nov 2026 - Consulting Services)
  const inv3Sub = 180000;
  const inv3Vat = 27000;
  const inv3Wht = 3600;
  const inv3Net = inv3Sub + inv3Vat - inv3Wht; // 203400
  const inv3Je = addJE(comp1Id, "JE-2026-0006", "2026-11-08", "INV-2026-003", "Sales Invoice INV-2026-003 - Al-Noor Trading Establishment", "INVOICE", null, "ETB", [
    { acc: coa1["1100"], desc: "AR - Al-Noor Trading", debit: inv3Net, credit: 0 },
    { acc: coa1["1310"], desc: "2% WHT credit", debit: inv3Wht, credit: 0 },
    { acc: coa1["4100"], desc: "Consulting revenue", debit: 0, credit: inv3Sub },
    { acc: coa1["2100"], desc: "15% Output VAT", debit: 0, credit: inv3Vat },
  ]);
  const inv3Id = Number(insInv.run(comp1Id, "INV-2026-003", c4, "2026-11-08", "2026-12-08", "ETB", 1, toMinor(inv3Sub), 15, toMinor(inv3Vat), 2, toMinor(inv3Wht), toMinor(inv3Net), toMinor(0), "SENT", "Q4 ERP Localization & Training", inv3Je).lastInsertRowid);
  insInvLine.run(inv3Id, i4, "ERP & Accounting Setup Consulting", 10, toMinor(18000), toMinor(180000));

  // Invoice 4 - OVERDUE (Oct 2026 - Banadir Commercial Distributors in USD converted to ETB!)
  const inv4SubUsd = 2800;
  const inv4Rate = 124.5;
  const inv4SubBase = inv4SubUsd * inv4Rate; // 348600
  const inv4Je = addJE(comp1Id, "JE-2026-0007", "2026-10-02", "INV-2026-004", "Export Invoice INV-2026-004 - Banadir Commercial Distributors (USD)", "INVOICE", null, "ETB", [
    { acc: coa1["1100"], desc: "AR - Banadir Commercial (USD 2,800)", debit: inv4SubBase, credit: 0 },
    { acc: coa1["4000"], desc: "Zero-rated export sales", debit: 0, credit: inv4SubBase },
  ]);
  const inv4Id = Number(insInv.run(comp1Id, "INV-2026-004", c3, "2026-10-02", "2026-11-01", "USD", inv4Rate, toMinor(inv4SubUsd), 0, toMinor(0), 0, toMinor(0), toMinor(inv4SubUsd), toMinor(0), "OVERDUE", "Zero-rated export invoice (USD)", inv4Je).lastInsertRowid);
  insInvLine.run(inv4Id, i3, "Wireless Barcode & Fiscal Scanner (Export)", 10, toMinor(280), toMinor(2800));

  // Bills for Company 1
  const insBill = db.prepare(`
    INSERT INTO bills (company_id, bill_number, vendor_id, issue_date, due_date, currency_code, exchange_rate, expense_account_id, subtotal, vat_rate, vat_amount, wht_rate, wht_amount, total, amount_paid, status, notes, journal_entry_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insBillLine = db.prepare(`
    INSERT INTO bill_lines (bill_id, item_id, description, quantity, unit_cost, line_total)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  // Bill 1 - Office Rent (PAID)
  const b1Sub = 120000;
  const b1Vat = 18000;
  const b1Wht = 2400;
  const b1Net = b1Sub + b1Vat - b1Wht; // 135600
  const b1Je = addJE(comp1Id, "JE-2026-0008", "2026-10-05", "BILL-2026-001", "Office Rent Q4 - Bole Business Tower", "BILL", null, "ETB", [
    { acc: coa1["6100"], desc: "Office rent expense", debit: b1Sub, credit: 0 },
    { acc: coa1["1300"], desc: "15% Input VAT", debit: b1Vat, credit: 0 },
    { acc: coa1["2000"], desc: "AP - Bole Business Tower", debit: 0, credit: b1Net },
    { acc: coa1["2110"], desc: "2% WHT Payable", debit: 0, credit: b1Wht },
  ]);
  const b1Id = Number(insBill.run(comp1Id, "BILL-2026-001", v1, "2026-10-05", "2026-10-20", "ETB", 1, coa1["6100"], toMinor(b1Sub), 15, toMinor(b1Vat), 2, toMinor(b1Wht), toMinor(b1Net), toMinor(b1Net), "PAID", "Bole HQ Office Lease", b1Je).lastInsertRowid);
  insBillLine.run(b1Id, null, "Bole HQ Office Lease (Oct-Nov)", 2, toMinor(60000), toMinor(120000));
  addJE(comp1Id, "JE-2026-0009", "2026-10-15", "PAY-BILL-001", "Payment for BILL-2026-001", "BILL_PAYMENT", b1Id, "ETB", [
    { acc: coa1["2000"], desc: "Clear AP Bole Business Tower", debit: b1Net, credit: 0 },
    { acc: coa1["1010"], desc: "Bank payment", debit: 0, credit: b1Net },
  ]);

  // Bill 2 - Telecom & Fiber (OPEN)
  const b2Sub = 32000;
  const b2Vat = 4800;
  const b2Wht = 640;
  const b2Net = b2Sub + b2Vat - b2Wht; // 36160
  const b2Je = addJE(comp1Id, "JE-2026-0010", "2026-11-03", "BILL-2026-002", "Enterprise Fiber & Cloud Telecom - Ethio Telecom", "BILL", null, "ETB", [
    { acc: coa1["6200"], desc: "Telecom & Fiber Internet", debit: b2Sub, credit: 0 },
    { acc: coa1["1300"], desc: "15% Input VAT", debit: b2Vat, credit: 0 },
    { acc: coa1["2000"], desc: "AP - Ethio Telecom", debit: 0, credit: b2Net },
    { acc: coa1["2110"], desc: "2% WHT Payable", debit: 0, credit: b2Wht },
  ]);
  const b2Id = Number(insBill.run(comp1Id, "BILL-2026-002", v2, "2026-11-03", "2026-11-30", "ETB", 1, coa1["6200"], toMinor(b2Sub), 15, toMinor(b2Vat), 2, toMinor(b2Wht), toMinor(b2Net), toMinor(0), "OPEN", "Dedicated fiber 100Mbps", b2Je).lastInsertRowid);
  insBillLine.run(b2Id, null, "Enterprise Fiber & SIP Trunk", 1, toMinor(32000), toMinor(32000));

  // Bill 3 - Freight & Customs (OPEN)
  const b3Sub = 95000;
  const b3Vat = 14250;
  const b3Wht = 1900;
  const b3Net = b3Sub + b3Vat - b3Wht; // 107350
  const b3Je = addJE(comp1Id, "JE-2026-0011", "2026-11-12", "BILL-2026-003", "Djibouti-Addis Corridor Freight - Red Sea Freight", "BILL", null, "ETB", [
    { acc: coa1["6300"], desc: "Freight & Customs Clearing", debit: b3Sub, credit: 0 },
    { acc: coa1["1300"], desc: "15% Input VAT", debit: b3Vat, credit: 0 },
    { acc: coa1["2000"], desc: "AP - Red Sea Freight", debit: 0, credit: b3Net },
    { acc: coa1["2110"], desc: "2% WHT Payable", debit: 0, credit: b3Wht },
  ]);
  const b3Id = Number(insBill.run(comp1Id, "BILL-2026-003", v3, "2026-11-12", "2026-12-12", "ETB", 1, coa1["6300"], toMinor(b3Sub), 15, toMinor(b3Vat), 2, toMinor(b3Wht), toMinor(b3Net), toMinor(0), "OPEN", "Container clearance & transport", b3Je).lastInsertRowid);
  insBillLine.run(b3Id, null, "40ft Container Freight & Customs", 1, toMinor(95000), toMinor(95000));

  // Employees for Company 1
  const insEmp = db.prepare(`
    INSERT INTO employees (company_id, employee_code, full_name, job_title, department, tin_number, base_salary, transport_allowance, housing_allowance, bank_account, hire_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const e1 = Number(insEmp.run(comp1Id, "EMP-001", "Selamawit Tadesse", "Chief Accountant", "Finance", "ET-992014", toMinor(32000), toMinor(2500), toMinor(4000), "CBE-10002849102", "2024-03-01").lastInsertRowid);
  const e2 = Number(insEmp.run(comp1Id, "EMP-002", "Beka Gemechu", "Operations Manager", "Logistics", "ET-992015", toMinor(28000), toMinor(2000), toMinor(3000), "AWASH-014209811", "2024-05-15").lastInsertRowid);
  const e3 = Number(insEmp.run(comp1Id, "EMP-003", "Hodan Farah", "Regional Sales Lead", "Sales", "ET-992016", toMinor(24000), toMinor(2000), toMinor(2500), "CBE-10008374920", "2025-01-10").lastInsertRowid);
  const e4 = Number(insEmp.run(comp1Id, "EMP-004", "Yusuf Ibrahim", "Inventory Controller", "Warehouse", "ET-992017", toMinor(15000), toMinor(1200), toMinor(1500), "DASHEN-5029184", "2025-04-01").lastInsertRowid);

  // Seed 1 Posted Payroll Run for Oct 2026 (Ethiopian PAYE + 7%/11% Pension)
  const empData = [
    { id: e1, base: 32000, tr: 2500, hs: 4000 },
    { id: e2, base: 28000, tr: 2000, hs: 3000 },
    { id: e3, base: 24000, tr: 2000, hs: 2500 },
    { id: e4, base: 15000, tr: 1200, hs: 1500 },
  ];
  const computedItems = empData.map((em) => {
    const pay = computeEmployeePay(
      {
        base_salary: toMinor(em.base),
        transport_allowance: toMinor(em.tr),
        housing_allowance: toMinor(em.hs),
      },
      "ET_STANDARD"
    );
    return { id: em.id, ...pay };
  });
  const totGross = computedItems.reduce((sum, item) => sum + item.gross, 0);
  const totTax = computedItems.reduce((sum, item) => sum + item.tax, 0);
  const totEmpPen = computedItems.reduce((sum, item) => sum + item.empPen, 0);
  const totCoPen = computedItems.reduce((sum, item) => sum + item.coPen, 0);
  const totNet = computedItems.reduce((sum, item) => sum + item.net, 0);

  const payJeId = addJE(comp1Id, "JE-2026-0012", "2026-10-30", "PAY-2026-10", "Monthly Payroll Run - October 2026", "PAYROLL", null, "ETB", [
    { acc: coa1["6000"], desc: "Gross salaries & allowances", debit: fromMinor(totGross), credit: 0 },
    { acc: coa1["6010"], desc: "Employer pension contribution (11%)", debit: fromMinor(totCoPen), credit: 0 },
    { acc: coa1["2200"], desc: "Employee PAYE income tax payable", debit: 0, credit: fromMinor(totTax) },
    { acc: coa1["2210"], desc: "Total pension payable (7% + 11%)", debit: 0, credit: fromMinor(totEmpPen + totCoPen) },
    { acc: coa1["1010"], desc: "Net salary bank disbursement", debit: 0, credit: fromMinor(totNet) },
  ]);
  const prId = Number(
    db
      .prepare(`
        INSERT INTO payroll_runs (company_id, period_label, pay_date, total_gross, total_income_tax, total_employee_pension, total_employer_pension, total_net, status, journal_entry_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'POSTED', ?)
      `)
      .run(comp1Id, "October 2026 (Tikimt 2019)", "2026-10-30", totGross, totTax, totEmpPen, totCoPen, totNet, payJeId)
      .lastInsertRowid
  );
  const insPrItem = db.prepare(`
    INSERT INTO payroll_items (payroll_run_id, employee_id, gross_salary, taxable_income, income_tax, employee_pension, employer_pension, net_salary)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const it of computedItems) {
    insPrItem.run(prId, it.id, it.gross, it.taxable, it.tax, it.empPen, it.coPen, it.net);
  }

  // ===== COMPANY 2 SEED DATA (Horn Logistics & Supply LLC - USD) =====
  addJE(comp2Id, "JE-2026-0001", "2026-09-01", "OPEN-CAP", "Initial paid-up capital in USD", "MANUAL", null, "USD", [
    { acc: coa2["1010"], desc: "Emirates NBD Operating USD", debit: 180000, credit: 0 },
    { acc: coa2["1200"], desc: "Opening freight equipment inventory", debit: 45000, credit: 0 },
    { acc: coa2["3000"], desc: "Owner's Share Capital", debit: 0, credit: 225000 },
  ]);

  const c2a = Number(insCust.run(comp2Id, "Berbera Port Commercial Authority", "finance@berberaport.so", "+252 63 442 1900", "SL-20941", "Berbera Free Zone", "USD", toMinor(100000)).lastInsertRowid);
  insCust.run(comp2Id, "Gulf Agro Commodities FZCO", "ap@gulfagro.ae", "+971 4 881 4400", "TRN-100293847100003", "Jebel Ali Free Zone, Dubai", "AED", toMinor(250000));
  const v2a = Number(insVend.run(comp2Id, "DP Maritime Chartering", "billing@dpmaritime.ae", "+971 4 551 9000", "TRN-100991827300003", "Dubai Maritime City", "USD").lastInsertRowid);

  const i2a = Number(insItem.run(comp2Id, "FRT-40FT", "40ft Sea Freight Charter (Dubai-Berbera)", "Freight", "SERVICE", "trip", toMinor(0), toMinor(14500), 0, 0, coa2["4100"], coa2["5000"], coa2["1200"]).lastInsertRowid);
  insItem.run(comp2Id, "GPS-TRK-9", "Satellite Container GPS Tracker", "Equipment", "PRODUCT", "unit", toMinor(220), toMinor(480), 18, 10, coa2["4000"], coa2["5000"], coa2["1200"]);

  const c2InvJe = addJE(comp2Id, "JE-2026-0002", "2026-10-15", "INV-2026-001", "Sales Invoice INV-2026-001 - Berbera Port Commercial Authority", "INVOICE", null, "USD", [
    { acc: coa2["1100"], desc: "AR - Berbera Port", debit: 30450, credit: 0 },
    { acc: coa2["4100"], desc: "Freight charter revenue", debit: 0, credit: 29000 },
    { acc: coa2["2100"], desc: "5% UAE VAT", debit: 0, credit: 1450 },
  ]);
  const c2InvId = Number(insInv.run(comp2Id, "INV-2026-001", c2a, "2026-10-15", "2026-11-15", "USD", 1, toMinor(29000), 5, toMinor(1450), 0, toMinor(0), toMinor(30450), toMinor(30450), "PAID", "2x 40ft Container Charters", c2InvJe).lastInsertRowid);
  insInvLine.run(c2InvId, i2a, "40ft Sea Freight Charter (Dubai-Berbera)", 2, toMinor(14500), toMinor(29000));
  addJE(comp2Id, "JE-2026-0003", "2026-10-28", "PAY-INV-001", "Wire payment received - Berbera Port", "INVOICE_PAYMENT", c2InvId, "USD", [
    { acc: coa2["1010"], desc: "USD Wire receipt", debit: 30450, credit: 0 },
    { acc: coa2["1100"], desc: "Clear AR", debit: 0, credit: 30450 },
  ]);

  const c2BillJe = addJE(comp2Id, "JE-2026-0004", "2026-11-02", "BILL-2026-001", "Vessel Slot Charter - DP Maritime", "BILL", null, "USD", [
    { acc: coa2["6300"], desc: "Maritime freight cost", debit: 16000, credit: 0 },
    { acc: coa2["1300"], desc: "5% Input VAT", debit: 800, credit: 0 },
    { acc: coa2["2000"], desc: "AP - DP Maritime", debit: 0, credit: 16800 },
  ]);
  const c2BillId = Number(insBill.run(comp2Id, "BILL-2026-001", v2a, "2026-11-02", "2026-12-02", "USD", 1, coa2["6300"], toMinor(16000), 5, toMinor(800), 0, toMinor(0), toMinor(16800), toMinor(0), "OPEN", "October vessel slot fees", c2BillJe).lastInsertRowid);
  insBillLine.run(c2BillId, null, "Vessel Slot Charter Fee", 2, toMinor(8000), toMinor(16000));

  insEmp.run(comp2Id, "EMP-101", "Omar Al-Hashimi", "Managing Director", "Executive", "AE-88120", toMinor(6500), toMinor(500), toMinor(1500), "ENBD-44019283", "2024-01-01");
  insEmp.run(comp2Id, "EMP-102", "Amina Warsame", "Logistics Coordinator", "Operations", "AE-88121", toMinor(3800), toMinor(400), toMinor(800), "ENBD-44019284", "2024-06-01");

  // Seed Audit Log entry
  db.prepare(`
    INSERT INTO audit_logs (company_id, user_id, action, entity_type, entity_id, details)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(comp1Id, adminId, "SYSTEM_SEED", "COMPANY", comp1Id, "Initialized Addis Horizon Trading PLC with standard IFRS/Ethiopian Chart of Accounts & sample transactions");
  db.prepare(`
    INSERT INTO audit_logs (company_id, user_id, action, entity_type, entity_id, details)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(comp2Id, adminId, "SYSTEM_SEED", "COMPANY", comp2Id, "Initialized Horn Logistics & Supply LLC with multi-currency USD/AED accounts");
}

export function resetDbForTests(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

export function getDb(): DatabaseSync {
  if (_db) return _db;
  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const dbPath = path.join(dataDir, "mizan.db");
  const db = new DatabaseSync(dbPath);
  try {
    initSchema(db);
    migrateMoneyToMinorUnits(db);
    bootstrapDatabase(db);
  } catch (err) {
    db.close();
    throw err;
  }
  _db = db;
  return _db;
}

export function logAudit(
  companyId: number,
  userId: number | null,
  action: string,
  entityType: string,
  entityId: number | null,
  details: string
) {
  const db = getDb();
  db.prepare(`
    INSERT INTO audit_logs (company_id, user_id, action, entity_type, entity_id, details)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(companyId, userId, action, entityType, entityId, details);
}
