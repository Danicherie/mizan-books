import { en } from "./en";
import type { Dictionary } from "./types";

const STATIC_KEYS = [
  "passwordShort",
  "passwordLong",
  "passwordSample",
  "signupFields",
  "userFields",
  "emailExists",
  "readOnly",
  "adminRequired",
  "booksRoleRequired",
  "noCompanyAccess",
  "noCompany",
  "forbidden",
  "unauthorized",
  "subscriptionPaused",
  "subscriptionNeeded",
  "recordExists",
  "requestFailed",
  "crossSite",
  "codeNameType",
  "vendorLinesRequired",
  "vendorNotFound",
  "billNotFound",
  "customerLinesRequired",
  "customerNotFound",
  "invoiceNotFound",
  "customerNameRequired",
  "vendorNameRequired",
  "companyNameRequired",
  "companyNotFound",
  "skuNameRequired",
  "itemNotFound",
  "adjustmentRequired",
  "journalDateRequired",
  "journalLineCount",
  "employeeNameRequired",
  "payrollPeriodRequired",
  "noActiveEmployees",
  "unknownAction",
  "invalidRequest",
  "subscriptionOwner",
  "currencyRateRequired",
  "taxRegimeUnknown",
  "tinText",
  "invalidAction",
  "demoDisabled",
  "invalidDemo",
  "debitCreditNonNegative",
  "lineBothSides",
  "journalTwoLines",
  "amountFinite",
  "amountEmpty",
  "amountTooLarge",
  "minorUnits",
  "moneyNotWhole",
  "moneyUnexpected",
] as const satisfies readonly (keyof Dictionary["errors"])[];

/** Show the API's English message in the language the reader chose. */
export function localizeApiError(t: Dictionary, message: string | undefined | null): string {
  const text = (message ?? "").trim();
  if (!text) return t.common.error;
  for (const key of STATIC_KEYS) {
    if (text === en.errors[key]) return t.errors[key];
  }

  const payment = text.match(/^Payment must be between 0 and (.+)$/);
  if (payment) return t.errors.paymentRange.replaceAll("{max}", payment[1]);

  const percent = text.match(/^(.+) must be between 0 and 100\.$/);
  if (percent) {
    const raw = percent[1];
    const label = raw === "VAT" ? t.common.vat : raw === "Withholding tax" ? t.common.wht : raw;
    return t.errors.percentRange.replaceAll("{label}", label);
  }

  const balance = text.match(
    /^Journal entry is out of balance: Debits \((.+)\) != Credits \((.+)\)\. Debits and credits must match to the cent\.$/
  );
  if (balance) {
    return t.errors.outOfBalance.replaceAll("{debits}", balance[1]).replaceAll("{credits}", balance[2]);
  }

  const invalidAccount = text.match(/^Account (.+) is not valid\.$/);
  if (invalidAccount) return t.errors.accountInvalid.replaceAll("{account}", invalidAccount[1]);

  const missingAccount = text.match(/^Account (\d+) does not exist\.$/);
  if (missingAccount) return t.errors.accountMissing.replaceAll("{account}", missingAccount[1]);

  const otherCompany = text.match(/^Account (\d+) belongs to another company\./);
  if (otherCompany) return t.errors.accountOtherCompany.replaceAll("{account}", otherCompany[1]);

  const money = text.match(/^Invalid money amount: (.+)$/);
  if (money) return t.errors.invalidMoney.replaceAll("{value}", money[1]);

  return text;
}
