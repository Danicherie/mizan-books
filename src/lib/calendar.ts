import type { Lang } from "./i18n/types";

export type CalendarSystem = "gregorian" | "ethiopian";

const ETH_MONTHS: Record<Lang, string[]> = {
  en: [
    "Meskerem", "Tikimt", "Hidar", "Tahsas", "Tir", "Yekatit",
    "Megabit", "Miazia", "Ginbot", "Sene", "Hamle", "Nehase", "Pagume",
  ],
  am: [
    "መስከረም", "ጥቅምት", "ኅዳር", "ታኅሣሥ", "ጥር", "የካቲት",
    "መጋቢት", "ሚያዝያ", "ግንቦት", "ሰኔ", "ሐምሌ", "ነሐሴ", "ጳጉሜን",
  ],
  om: [
    "Fulbaana", "Onkololeessa", "Sadaasa", "Muddee", "Amajjii", "Guraandhala",
    "Bitootessa", "Elba", "Caamsaa", "Waxabajjii", "Adoolessa", "Hagayya", "Qaammee",
  ],
  so: [
    "Meskerem", "Tikimt", "Hidar", "Tahsas", "Tir", "Yekatit",
    "Megabit", "Miazia", "Ginbot", "Sene", "Hamle", "Nehase", "Pagume",
  ],
  ar: [
    "مسكرم", "طكمت", "هدار", "تهساس", "طر", "يكاتيت",
    "مغابيت", "ميازيا", "غنبوت", "سيني", "هاملي", "نهاسي", "باغومي",
  ],
};

const GREG_MONTHS: Record<Lang, string[]> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  am: ["ጃንዩ", "ፌብሩ", "ማርች", "ኤፕሪ", "ሜይ", "ጁን", "ጁላይ", "ኦገስ", "ሴፕቴ", "ኦክቶ", "ኖቬም", "ዲሴም"],
  om: ["Ama", "Gur", "Bit", "Elb", "Caa", "Wax", "Ado", "Hag", "Ful", "Onk", "Sad", "Mud"],
  so: ["Jan", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Seb", "Okt", "Nof", "Dis"],
  ar: ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"],
};

// Julian Day Number from Gregorian date (Proleptic Gregorian)
function gregorianToJdn(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

// Ethiopian calendar epoch in JDN: August 29, 8 CE (Julian) = JDN 1724221
const ETHIOPIC_EPOCH = 1724221;

export function gregorianToEthiopian(year: number, month: number, day: number): {
  year: number;
  month: number;
  day: number;
} {
  const jdn = gregorianToJdn(year, month, day);
  const r = (jdn - ETHIOPIC_EPOCH) % 1461;
  const n = (r % 365) + 365 * Math.floor(r / 1460);
  const ethYear =
    4 * Math.floor((jdn - ETHIOPIC_EPOCH) / 1461) +
    Math.floor(r / 365) -
    Math.floor(r / 1460) +
    1;
  const ethMonth = Math.floor(n / 30) + 1;
  const ethDay = (n % 30) + 1;
  return { year: ethYear, month: ethMonth, day: ethDay };
}

export function formatDate(
  isoDate: string | null | undefined,
  calendar: CalendarSystem,
  lang: Lang
): string {
  if (!isoDate) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!match) return isoDate;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  if (calendar === "ethiopian") {
    const eth = gregorianToEthiopian(year, month, day);
    const monthName = ETH_MONTHS[lang]?.[eth.month - 1] ?? ETH_MONTHS.en[eth.month - 1];
    const era = lang === "am" ? "ዓ.ም" : lang === "ar" ? "إثيوبي" : "E.C.";
    return `${monthName} ${eth.day}, ${eth.year} ${era}`;
  }

  const monthName = GREG_MONTHS[lang]?.[month - 1] ?? GREG_MONTHS.en[month - 1];
  return `${monthName} ${day}, ${year}`;
}

export function formatMonth(
  yyyyMm: string,
  calendar: CalendarSystem,
  lang: Lang
): string {
  const match = /^(\d{4})-(\d{2})$/.exec(yyyyMm);
  if (!match) return yyyyMm;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  if (calendar === "ethiopian") {
    const eth = gregorianToEthiopian(year, month, 15);
    const monthName = ETH_MONTHS[lang]?.[eth.month - 1] ?? ETH_MONTHS.en[eth.month - 1];
    return `${monthName} ${eth.year}`;
  }
  const monthName = GREG_MONTHS[lang]?.[month - 1] ?? GREG_MONTHS.en[month - 1];
  return `${monthName} ${year}`;
}

export function getTodayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
