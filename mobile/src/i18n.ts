export type Lang = "en" | "am" | "om" | "so" | "ar";
export type CalendarSystem = "gregorian" | "ethiopian";

export const LANGUAGES: Array<{ code: Lang; short: string; native: string }> = [
  { code: "en", short: "EN", native: "English" },
  { code: "am", short: "አማ", native: "አማርኛ" },
  { code: "om", short: "OM", native: "Oromoo" },
  { code: "so", short: "SO", native: "Soomaali" },
  { code: "ar", short: "عربي", native: "العربية" },
];

export const isRtl = (lang: Lang) => lang === "ar";

const CURRENCY_SYMBOLS: Record<string, string> = {
  ETB: "Br",
  USD: "$",
  SOS: "Sh",
  KES: "KSh",
  SAR: "﷼",
  AED: "د.إ",
  EUR: "€",
};

export function formatMoney(amount: number | undefined, currency = "ETB"): string {
  const sym = CURRENCY_SYMBOLS[currency] || currency;
  const val = Number(amount || 0);
  const abs = Math.abs(val).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${val < 0 ? "-" : ""}${sym} ${abs}`;
}

const ETH_MONTHS: Record<Lang, string[]> = {
  en: ["Meskerem", "Tikimt", "Hidar", "Tahsas", "Tir", "Yekatit", "Megabit", "Miazia", "Ginbot", "Sene", "Hamle", "Nehase", "Pagume"],
  am: ["መስከረም", "ጥቅምት", "ኅዳር", "ታኅሣሥ", "ጥር", "የካቲት", "መጋቢት", "ሚያዝያ", "ግንቦት", "ሰኔ", "ሐምሌ", "ነሐሴ", "ጳጉሜን"],
  om: ["Fulbaana", "Onkololeessa", "Sadaasa", "Muddee", "Amajjii", "Guraandhala", "Bitootessa", "Elba", "Caamsaa", "Waxabajjii", "Adoolessa", "Hagayya", "Qaammee"],
  so: ["Meskerem", "Tikimt", "Hidar", "Tahsas", "Tir", "Yekatit", "Megabit", "Miazia", "Ginbot", "Sene", "Hamle", "Nehase", "Pagume"],
  ar: ["مسكرم", "طكمت", "هدار", "تهساس", "طر", "يكاتيت", "مغابيت", "ميازيا", "غنبوت", "سيني", "هاملي", "نهاسي", "باغومي"],
};

export function formatDate(iso: string | undefined, cal: CalendarSystem, lang: Lang): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  if (cal === "gregorian") return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const mm = month + 12 * a - 3;
  const jdn = day + Math.floor((153 * mm + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
  const r = (jdn - 1724221) % 1461;
  const n = (r % 365) + 365 * Math.floor(r / 1460);
  const ethYear = 4 * Math.floor((jdn - 1724221) / 1461) + Math.floor(r / 365) - Math.floor(r / 1460) + 1;
  const ethMonth = Math.floor(n / 30) + 1;
  const ethDay = (n % 30) + 1;
  return `${ETH_MONTHS[lang][ethMonth - 1]} ${ethDay}, ${ethYear}`;
}

export const MOBILE_TEXT: Record<
  Lang,
  {
    appName: string;
    signIn: string;
    signUp: string;
    freeTrialBadge: string;
    startTrialBtn: string;
    demoBtn: string;
    fullName: string;
    companyName: string;
    email: string;
    password: string;
    serverUrl: string;
    dashboard: string;
    invoices: string;
    bills: string;
    reports: string;
    settings: string;
    cash: string;
    receivables: string;
    payables: string;
    netIncome: string;
    trialBalance: string;
    profitLoss: string;
    balanceSheet: string;
    balanced: string;
    totalAssets: string;
    totalLiabEq: string;
    totalRevenue: string;
    totalExpenses: string;
    recordPaid: string;
    signOut: string;
    gregorian: string;
    ethiopian: string;
    daysLeft: string;
    switchCompany: string;
  }
> = {
  en: {
    appName: "Mizan Books",
    signIn: "Sign In",
    signUp: "30-Day Free Trial",
    freeTrialBadge: "1-Month Free Trial · No Card Needed",
    startTrialBtn: "Create Account & Start Free Trial",
    demoBtn: "Instant Admin Demo",
    fullName: "Full Name",
    companyName: "Company Name",
    email: "Email",
    password: "Password",
    serverUrl: "API Server URL",
    dashboard: "Home",
    invoices: "Invoices",
    bills: "Bills",
    reports: "Reports",
    settings: "Settings",
    cash: "Cash & Bank",
    receivables: "Receivables",
    payables: "Payables",
    netIncome: "Net Income",
    trialBalance: "Trial Balance",
    profitLoss: "Profit & Loss",
    balanceSheet: "Balance Sheet",
    balanced: "Balanced",
    totalAssets: "Total Assets",
    totalLiabEq: "Total Liab. & Equity",
    totalRevenue: "Total Revenue",
    totalExpenses: "Total Expenses",
    recordPaid: "Mark Paid",
    signOut: "Sign Out",
    gregorian: "Gregorian",
    ethiopian: "Ethiopian",
    daysLeft: "days left in trial",
    switchCompany: "Active Company",
  },
  am: {
    appName: "ሚዛን ቡክስ",
    signIn: "ግባ",
    signUp: "የ30 ቀን ነፃ ሙከራ",
    freeTrialBadge: "የ1 ወር ነፃ ሙከራ · ክሬዲት ካርድ አያስፈልግም",
    startTrialBtn: "መለያ ፍጠር እና ሙከራ ጀምር",
    demoBtn: "ፈጣን የሙከራ መግቢያ",
    fullName: "ሙሉ ስም",
    companyName: "የኩባንያ ስም",
    email: "ኢሜይል",
    password: "የይለፍ ቃል",
    serverUrl: "የሰርቨር አድራሻ",
    dashboard: "ዳሽቦርድ",
    invoices: "ደረሰኞች",
    bills: "ቢሎች",
    reports: "ሪፖርቶች",
    settings: "ቅንብሮች",
    cash: "ጥሬ ገንዘብ እና ባንክ",
    receivables: "ተሰብሳቢ ሂሳብ",
    payables: "ተከፋይ ሂሳብ",
    netIncome: "የተጣራ ትርፍ",
    trialBalance: "የሙከራ ሚዛን",
    profitLoss: "ትርፍ እና ኪሳራ",
    balanceSheet: "ሀብት እና ዕዳ",
    balanced: "ተመጣጥኗል",
    totalAssets: "ጠቅላላ ሀብት",
    totalLiabEq: "ጠቅላላ ዕዳ እና ካፒታል",
    totalRevenue: "ጠቅላላ ገቢ",
    totalExpenses: "ጠቅላላ ወጪ",
    recordPaid: "ተከፍሏል መዝግብ",
    signOut: "ውጣ",
    gregorian: "ጎርጎርዮሳዊ",
    ethiopian: "ኢትዮጵያዊ",
    daysLeft: "ቀናት ቀርተዋል",
    switchCompany: "ንቁ ኩባንያ",
  },
  om: {
    appName: "Mizan Books",
    signIn: "Seeni",
    signUp: "Yaalii Bilisaa Guyyaa 30",
    freeTrialBadge: "Yaalii Bilisaa Ji'a 1 · Kaardii Malee",
    startTrialBtn: "Herrega Uumi & Yaalii Jalqabi",
    demoBtn: "Seensa Yaalii Ariifataa",
    fullName: "Maqaa Guutuu",
    companyName: "Maqaa Dhaabbataa",
    email: "Imeelii",
    password: "Jecha Darbii",
    serverUrl: "Teessoo Seervarii API",
    dashboard: "Daashboordii",
    invoices: "Nagahee",
    bills: "Biilii",
    reports: "Gabaasa",
    settings: "Qindaa'ina",
    cash: "Baankii & Harkaa",
    receivables: "Fudhatamu",
    payables: "Kaffalamu",
    netIncome: "Bu'aa Qulqulluu",
    trialBalance: "Madaallii Yaalii",
    profitLoss: "Bu'aa & Kasaaraa",
    balanceSheet: "Qabeenya & Idaa",
    balanced: "Wal-madaaleera",
    totalAssets: "Qabeenya Waliigalaa",
    totalLiabEq: "Idaa & Kaappitaala",
    totalRevenue: "Galii Waliigalaa",
    totalExpenses: "Baasii Waliigalaa",
    recordPaid: "Kaffaltii Galmeessi",
    signOut: "Ba'i",
    gregorian: "Giroogoriyaan",
    ethiopian: "Itoophiyaa",
    daysLeft: "guyyoota yaalii hafan",
    switchCompany: "Dhaabbata Filatame",
  },
  so: {
    appName: "Mizan Books",
    signIn: "Soo Gal",
    signUp: "30 Maalmood Bilaash",
    freeTrialBadge: "1 Bil Tijaabo Bilaash ah · Kaar La'aan",
    startTrialBtn: "Samee Akoon & Bilow Tijaabo",
    demoBtn: "Gelitaan Tijaabo Degdeg ah",
    fullName: "Magaca Buuxa",
    companyName: "Magaca Shirkadda",
    email: "Iimayl",
    password: "Furaha Sirta",
    serverUrl: "Ciwaanka Server-ka API",
    dashboard: "Guudmar",
    invoices: "Qaansheeg",
    bills: "Biilal",
    reports: "Warbixin",
    settings: "Dejinta",
    cash: "Caddaan & Bangi",
    receivables: "La Sugayo",
    payables: "La Bixinayo",
    netIncome: "Faa'iido Saafi",
    trialBalance: "Miisaanka Tijaabada",
    profitLoss: "Faa'iido & Khasaare",
    balanceSheet: "Xaashida Miisaanka",
    balanced: "Isu Dheellitiran",
    totalAssets: "Wadarta Hantida",
    totalLiabEq: "Deymaha & Raasamaalka",
    totalRevenue: "Dakhliga Guud",
    totalExpenses: "Kharashka Guud",
    recordPaid: "La Bixiyay",
    signOut: "Ka Bax",
    gregorian: "Miilaadi",
    ethiopian: "Itoobiyaan",
    daysLeft: "maalmood tijaabo haray",
    switchCompany: "Shirkadda Firfircoon",
  },
  ar: {
    appName: "ميزان بوكس",
    signIn: "تسجيل الدخول",
    signUp: "تجربة مجانية 30 يوماً",
    freeTrialBadge: "شهر مجاني بالكامل · بدون بطاقة ائتمان",
    startTrialBtn: "إنشاء حساب وبدء التجربة",
    demoBtn: "دخول تجريبي فوري",
    fullName: "الاسم الكامل",
    companyName: "اسم الشركة",
    email: "البريد الإلكتروني",
    password: "كلمة المرور",
    serverUrl: "رابط خادم API",
    dashboard: "الرئيسية",
    invoices: "الفواتير",
    bills: "المصروفات",
    reports: "التقارير",
    settings: "الإعدادات",
    cash: "النقد والبنك",
    receivables: "الذمم المدينة",
    payables: "الذمم الدائنة",
    netIncome: "صافي الربح",
    trialBalance: "ميزان المراجعة",
    profitLoss: "الأرباح والخسائر",
    balanceSheet: "الميزانية العمومية",
    balanced: "متوازن",
    totalAssets: "إجمالي الأصول",
    totalLiabEq: "الالتزامات والملكية",
    totalRevenue: "إجمالي الإيرادات",
    totalExpenses: "إجمالي المصروفات",
    recordPaid: "تسجيل الدفع",
    signOut: "تسجيل الخروج",
    gregorian: "ميلادي",
    ethiopian: "إثيوبي",
    daysLeft: "يوماً في التجربة",
    switchCompany: "الشركة النشطة",
  },
};
