from __future__ import annotations

from pathlib import Path
import re

types_path = Path("src/lib/i18n/messages/types.ts")
types = types_path.read_text(encoding="utf-8")

# Remove duplicate addMoney in customers block
cust = re.search(r"customers: \{([\s\S]*?)\n  \};", types)
if cust and cust.group(1).count("addMoney:") > 1:
    lines = []
    seen = False
    for line in cust.group(1).splitlines(True):
        if "addMoney: string;" in line:
            if seen:
                continue
            seen = True
        lines.append(line)
    types = types[: cust.start(1)] + "".join(lines) + types[cust.end(1) :]
    types_path.write_text(types, encoding="utf-8")
    print("removed duplicate addMoney")
    types = types_path.read_text(encoding="utf-8")

sections: dict[str, list[str]] = {}
for m in re.finditer(r"\n  (\w+): \{([\s\S]*?)\n  \};", types):
    sections[m.group(1)] = re.findall(r"^\s+(\w+): string;", m.group(2), re.M)
print("sections", {k: len(v) for k, v in sections.items()})


def get_object_block(text: str, name: str):
    m = re.search(rf"\n  {name}: \{{", text)
    if not m:
        return None, None, None
    start = m.end() - 1
    depth = 0
    i = start
    while i < len(text):
        ch = text[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                end = i + 1
                return start, end, text[start:end]
        i += 1
    return None, None, None


def en_value(key: str) -> str:
    special = {
        "correctHighlightedFields": "Please correct the highlighted fields.",
        "selectLocalCustomer": "Select a local customer.",
        "wallet": "Wallet",
        "ledgerEntries": "Ledger entries",
        "oldestFirst": "Oldest first",
        "newestFirst": "Newest first",
        "loadingCash": "Loading cash…",
        "noCashYet": "No cash yet",
        "loadingDashboard": "Loading dashboard…",
        "newDeposit": "New deposit",
        "newWithdrawal": "New withdrawal",
        "newHawala": "New hawala",
        "thisMonthTransactions": "This month's transactions",
        "fullName": "Full name",
        "customerCode": "Customer code",
        "openingWallet": "Opening wallet",
        "saveCustomer": "Save customer",
        "information": "Information",
        "savePartner": "Save partner",
        "backToList": "Back to list",
        "searchSelectPlaceholder": "Search…",
        "selectPlaceholder": "Select…",
        "hawalaSearchPlaceholder": "Search hawala…",
        "partnerCommission": "Partner commission",
        "localCustomerTag": "Local customer",
        "externalTag": "External",
        "feeExample": "e.g. 100",
        "perExample": "e.g. 100000",
        "walkInCustomer": "Walk-in customer",
        "walkInName": "Walk-in name",
        "whichHigher": "Which is higher",
        "existingCustomer": "Existing customer",
        "relatedLedger": "Related ledger",
        "senderCustomer": "Sender customer",
        "receiverCustomer": "Receiver customer",
        "selectCurrency": "Select currency",
        "posting": "Posting",
        "walletName": "Wallet name",
        "walletType": "Wallet type",
        "selectCustomer": "Select customer",
        "saveWallet": "Save wallet",
        "system": "System",
        "transactionType": "Transaction type",
        "debitWallet": "Debit wallet",
        "creditWallet": "Credit wallet",
        "addMoney": "Add money",
    }
    if key in special:
        return special[key]
    words = re.sub(r"([A-Z])", r" \1", key).strip()
    return words[:1].upper() + words[1:] if words else key


fa_map = {
    "correctHighlightedFields": "لطفاً خانه‌های مشخص‌شده را تصحیح کنید.",
    "selectLocalCustomer": "یک مشتری محلی انتخاب کنید.",
    "wallet": "حساب",
    "ledgerEntries": "ثبت‌های دفتر",
    "oldestFirst": "قدیمی‌ترین اول",
    "newestFirst": "جدیدترین اول",
    "loadingCash": "در حال بارگذاری صندوق…",
    "noCashYet": "هنوز نقدی نیست",
    "loadingDashboard": "در حال بارگذاری صفحه اصلی…",
    "newDeposit": "ودیعه جدید",
    "newWithdrawal": "برداشت جدید",
    "newHawala": "حواله جدید",
    "thisMonthTransactions": "معاملات این ماه",
    "fullName": "نام مکمل",
    "customerCode": "کد مشتری",
    "openingWallet": "حساب افتتاحیه",
    "saveCustomer": "ذخیره مشتری",
    "information": "اطلاعات",
    "savePartner": "ذخیره صرافی همکار",
    "backToList": "بازگشت به لیست",
    "searchSelectPlaceholder": "جستجو…",
    "selectPlaceholder": "انتخاب…",
    "hawalaSearchPlaceholder": "جستجوی حواله…",
    "partnerCommission": "کمیشن همکار",
    "localCustomerTag": "مشتری محلی",
    "externalTag": "بیرونی",
    "feeExample": "مثلاً ۱۰۰",
    "perExample": "مثلاً ۱۰۰۰۰۰",
    "walkInCustomer": "مشتری حضوری",
    "walkInName": "نام مشتری حضوری",
    "whichHigher": "کدام بالاتر است",
    "existingCustomer": "مشتری موجود",
    "relatedLedger": "ثبت‌های مرتبط",
    "senderCustomer": "مشتری فرستنده",
    "receiverCustomer": "مشتری گیرنده",
    "selectCurrency": "انتخاب اسعار",
    "posting": "ثبت مالی",
    "walletName": "نام حساب",
    "walletType": "نوع حساب",
    "selectCustomer": "انتخاب مشتری",
    "saveWallet": "ذخیره حساب",
    "system": "سیستم",
    "transactionType": "نوع معامله",
    "debitWallet": "حساب بدهکار",
    "creditWallet": "حساب بستانکار",
    "addMoney": "افزودن پول",
}

ps_map = {
    "correctHighlightedFields": "مهرباني وکړئ په نښه شوي ځایونه سم کړئ.",
    "selectLocalCustomer": "یو محلي پیرودونکی وټاکئ.",
    "wallet": "حساب",
    "ledgerEntries": "د دفتر ثبتونه",
    "oldestFirst": "زړې لومړی",
    "newestFirst": "نوي لومړی",
    "loadingCash": "صندوق بارېږي…",
    "noCashYet": "تر اوسه نغدې نشته",
    "loadingDashboard": "اصلي پاڼه بارېږي…",
    "newDeposit": "نوې جمع",
    "newWithdrawal": "نوی ایستل",
    "newHawala": "نوې حواله",
    "thisMonthTransactions": "د دې میاشتې معاملات",
    "fullName": "بشپړ نوم",
    "customerCode": "د پیرودونکي کوډ",
    "openingWallet": "د پرانیستلو حساب",
    "saveCustomer": "پیرودونکی وساتئ",
    "information": "معلومات",
    "savePartner": "شریکه صرافي وساتئ",
    "backToList": "بیرته لیست ته",
    "searchSelectPlaceholder": "لټون…",
    "selectPlaceholder": "وټاکئ…",
    "hawalaSearchPlaceholder": "حواله ولټوئ…",
    "partnerCommission": "د شریک کمیشن",
    "localCustomerTag": "محلي پیرودونکی",
    "externalTag": "بهرنی",
    "feeExample": "لکه ۱۰۰",
    "perExample": "لکه ۱۰۰۰۰۰",
    "walkInCustomer": "حضوري پیرودونکی",
    "walkInName": "د حضوري پیرودونکي نوم",
    "whichHigher": "کوم لوړ دی",
    "existingCustomer": "شته پیرودونکی",
    "relatedLedger": "اړوند ثبتونه",
    "senderCustomer": "لیږونکی پیرودونکی",
    "receiverCustomer": "اخیستونکی پیرودونکی",
    "selectCurrency": "اسعار وټاکئ",
    "posting": "مالي ثبت",
    "walletName": "د حساب نوم",
    "walletType": "د حساب ډول",
    "selectCustomer": "پیرودونکی وټاکئ",
    "saveWallet": "حساب وساتئ",
    "system": "سیسټم",
    "transactionType": "د معاملې ډول",
    "debitWallet": "پورور حساب",
    "creditWallet": "طلب حساب",
    "addMoney": "پیسې اضافه کړئ",
}

for loc, vmap in [("en", None), ("fa", fa_map), ("ps", ps_map)]:
    path = Path(f"src/lib/i18n/messages/{loc}.ts")
    text = path.read_text(encoding="utf-8")
    for sec, keys in sections.items():
        s, e, obj = get_object_block(text, sec)
        if obj is None:
            print(loc, "missing section", sec)
            continue
        present = set(re.findall(r"^\s{4}(\w+):", obj, re.M))
        missing = [k for k in keys if k not in present]
        if not missing:
            continue
        inserts = []
        for k in missing:
            val = en_value(k) if loc == "en" else (vmap.get(k) or en_value(k))
            val = val.replace("\\", "\\\\").replace('"', '\\"')
            inserts.append(f'    {k}: "{val}",\n')
        new_obj = obj[:-1] + "".join(inserts) + "}"
        text = text[:s] + new_obj + text[e:]
        print(loc, sec, "added", len(missing))
    path.write_text(text, encoding="utf-8")

print("done sync")
