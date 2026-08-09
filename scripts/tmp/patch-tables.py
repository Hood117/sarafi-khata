"""Bulk-wire common table headers and filters to useT()."""
from __future__ import annotations

from pathlib import Path

ROOT = Path("src/features")

def ensure_client_and_uset(text: str, after_import_needle: str | None = None) -> str:
    if '"use client"' not in text[:40]:
        text = '"use client";\n\n' + text.lstrip()
    if "useT" not in text:
        # insert import after last @/ import block if possible
        if 'from "@/lib/i18n"' not in text:
            # place before last relative/local or after design-system
            insert = 'import { useT } from "@/lib/i18n";\n'
            # after first import block from @/
            lines = text.splitlines(keepends=True)
            last_import = 0
            for i, line in enumerate(lines):
                if line.startswith("import "):
                    last_import = i
            lines.insert(last_import + 1, insert)
            text = "".join(lines)
    return text


def inject_t_hook(text: str, fn_sig_end: str) -> str:
    """Insert const t = useT(); after function opening if missing."""
    if "const t = useT();" in text:
        return text
    marker = fn_sig_end
    if marker not in text:
        return text
    return text.replace(marker, marker + "\n  const t = useT();", 1)


# --- Hawala table ---
p = Path("src/features/hawala/components/hawala-table.tsx")
t = p.read_text(encoding="utf-8")
t = ensure_client_and_uset(t)
t = inject_t_hook(t, "}: HawalaTableProps) {")
repls = [
    ("<TableHead>Reference Number</TableHead>", "<TableHead>{t.hawala.referenceNumber}</TableHead>"),
    ("<TableHead>Sender</TableHead>", "<TableHead>{t.hawala.sender}</TableHead>"),
    ("<TableHead>Receiver</TableHead>", "<TableHead>{t.hawala.receiver}</TableHead>"),
    ("<TableHead>Partner Sarafi</TableHead>", "<TableHead>{t.hawala.partner}</TableHead>"),
    ("<TableHead>Origin</TableHead>", "<TableHead>{t.hawala.origin}</TableHead>"),
    ("<TableHead>Destination</TableHead>", "<TableHead>{t.hawala.destination}</TableHead>"),
    ("<TableHead>Currency</TableHead>", "<TableHead>{t.common.currency}</TableHead>"),
    ("<TableHead>Amount</TableHead>", "<TableHead>{t.common.amount}</TableHead>"),
    ("<TableHead>Status</TableHead>", "<TableHead>{t.common.status}</TableHead>"),
    ("<TableHead>Date</TableHead>", "<TableHead>{t.common.date}</TableHead>"),
    ("<TableHead>Operator</TableHead>", "<TableHead>{t.audit.actor}</TableHead>"),
    ('<TableHead className="w-[100px]">Actions</TableHead>',
     '<TableHead className="w-[100px]">{t.common.actions}</TableHead>'),
    ("View", "{t.common.view}"),  # careful
]
for a, b in repls:
    if a in t:
        t = t.replace(a, b)
        print("hawala-table:", a[:40])
# Fix View button carefully
t = t.replace(">View</", ">{t.common.view}</")
# Fix text-right if any
t = t.replace("text-right", "text-end")
t = t.replace("-ml-", "-ms-")
p.write_text(t, encoding="utf-8")
print("wrote hawala-table")

# --- Hawala detail ---
p = Path("src/features/hawala/components/hawala-detail.tsx")
t = p.read_text(encoding="utf-8")
t = ensure_client_and_uset(t)
# find export function
if "export function HawalaDetail" in t and "const t = useT();" not in t:
    t = t.replace(
        "export function HawalaDetail(",
        "export function HawalaDetail(",
    )
# Find the main component function body
import re
m = re.search(r"export function (\w+)\([^)]*\) \{", t)
if m and "const t = useT();" not in t.split(m.group(0), 1)[1][:200]:
    t = t.replace(m.group(0), m.group(0) + "\n  const t = useT();", 1)
    print("detail hook", m.group(1))

detail_repls = [
    ('label="Currency"', "label={t.common.currency}"),
    ('label="Amount"', "label={t.common.amount}"),
    ('label="Status"', "label={t.common.status}"),
    ('label="Notes"', "label={t.common.notes}"),
    ('label="Reference"', "label={t.common.reference}"),
    ('label="Sender"', "label={t.hawala.sender}"),
    ('label="Receiver"', "label={t.hawala.receiver}"),
    ('label="Partner"', "label={t.hawala.partner}"),
    ('label="Partner Sarafi"', "label={t.hawala.partner}"),
    ('label="Origin"', "label={t.hawala.origin}"),
    ('label="Destination"', "label={t.hawala.destination}"),
    ('label="Value date"', "label={t.hawala.valueDate}"),
    ('label="Date"', "label={t.common.date}"),
    ("Back to hawala", "{t.hawala.backToList}"),
    ("-ml-2", "-ms-2"),
    ("text-right", "text-end"),
    ("mr-1.5", "me-1.5"),
]
for a, b in detail_repls:
    c = t.count(a)
    if c:
        t = t.replace(a, b)
        print(f"detail x{c}: {a}")
p.write_text(t, encoding="utf-8")
print("wrote hawala-detail")

print("done batch1")
