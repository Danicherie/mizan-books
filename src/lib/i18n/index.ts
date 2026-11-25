import { en } from "./en";
import { am } from "./am";
import { om } from "./om";
import { so } from "./so";
import { ar } from "./ar";
import { LANGUAGES, type Dictionary, type Lang } from "./types";

export { LANGUAGES, type Dictionary, type Lang };

export const DICTIONARIES: Record<Lang, Dictionary> = {
  en,
  am,
  om,
  so,
  ar,
};

export function getDictionary(lang: Lang): Dictionary {
  return DICTIONARIES[lang] ?? en;
}

export function isRtl(lang: Lang): boolean {
  return lang === "ar";
}

export function localizedAccountName(
  account: {
    name: string;
    name_am?: string | null;
    name_om?: string | null;
    name_so?: string | null;
    name_ar?: string | null;
  },
  lang: Lang
): string {
  if (lang === "am" && account.name_am) return account.name_am;
  if (lang === "om" && account.name_om) return account.name_om;
  if (lang === "so" && account.name_so) return account.name_so;
  if (lang === "ar" && account.name_ar) return account.name_ar;
  return account.name;
}
