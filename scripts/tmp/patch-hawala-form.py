from pathlib import Path
import re

path = Path("src/features/hawala/components/hawala-form.tsx")
text = path.read_text(encoding="utf-8")

if 'from "@/lib/i18n"' not in text:
    text = text.replace(
        'import { cn } from "@/lib/utils";\n',
        'import { useT } from "@/lib/i18n";\nimport { cn } from "@/lib/utils";\n',
    )

old_toggle = '''function SourceToggle({
  id,
  value,
  disabled,
  onChange,
}: {
  id: string;
  value: HawalaPartySource;
  disabled: boolean;
  onChange: (value: HawalaPartySource) => void;
}) {
  return (
    <div
      className="bg-muted/40 flex gap-1 rounded-lg p-1"
      role="radiogroup"
      aria-label="Party source"
    >
      {(
        [
          ["customer", "Existing customer"],
          ["external", "External person"],
        ] as const
      ).map(([source, label]) => {'''

new_toggle = '''function SourceToggle({
  id,
  value,
  disabled,
  onChange,
  customerLabel,
  externalLabel,
  ariaLabel,
}: {
  id: string;
  value: HawalaPartySource;
  disabled: boolean;
  onChange: (value: HawalaPartySource) => void;
  customerLabel: string;
  externalLabel: string;
  ariaLabel: string;
}) {
  return (
    <div
      className="bg-muted/40 flex gap-1 rounded-lg p-1"
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {(
        [
          ["customer", customerLabel],
          ["external", externalLabel],
        ] as const
      ).map(([source, label]) => {'''

if old_toggle in text:
    text = text.replace(old_toggle, new_toggle)
    print("SourceToggle updated")
else:
    print("SourceToggle pattern missing")

if "const t = useT();" not in text:
    text = text.replace(
        "}: HawalaFormProps) {\n  const [form, setForm] = useState<HawalaFormValues>(",
        "}: HawalaFormProps) {\n  const t = useT();\n  const [form, setForm] = useState<HawalaFormValues>(",
    )
    print("useT added")

if 'errorFallbackMessage = "Unable to save hawala. Please try again.",' in text:
    text = text.replace(
        'errorFallbackMessage = "Unable to save hawala. Please try again.",',
        "errorFallbackMessage,",
    )

old_submit = '''  const resolvedSubmitLabel =
    submitLabel ??
    (direction === "SEND" ? "Send Hawala" : "Receive Hawala");'''
new_submit = '''  const resolvedErrorFallback = errorFallbackMessage ?? t.common.error;
  const resolvedSubmitLabel =
    submitLabel ??
    (direction === "SEND" ? t.hawala.sendTitle : t.hawala.receiveTitle);'''
if old_submit in text:
    text = text.replace(old_submit, new_submit)
    print("submit labels updated")

# Replace catch/error uses of errorFallbackMessage variable with resolved
text = text.replace(
    "setFormError(errorFallbackMessage);",
    "setFormError(resolvedErrorFallback);",
)
text = text.replace(
    "setFormError(errorFallbackMessage)",
    "setFormError(resolvedErrorFallback)",
)

simple = [
    ('title="Parties"', "title={t.hawala.parties}"),
    (
        'description="Choose an existing local customer or enter an external person. External people are not registered as customers."',
        "description={t.hawala.partiesHint}",
    ),
    ("                Sender\n", "                {t.hawala.sender}\n"),
    ("                Receiver\n", "                {t.hawala.receiver}\n"),
    ("                    Local customer\n", "                    {t.hawala.localCustomer}\n"),
    (
        '<FieldLabel htmlFor="hawala-sender-name">Name</FieldLabel>',
        '<FieldLabel htmlFor="hawala-sender-name">{t.common.name}</FieldLabel>',
    ),
    (
        '<FieldLabel htmlFor="hawala-sender-phone">Phone</FieldLabel>',
        '<FieldLabel htmlFor="hawala-sender-phone">{t.common.phone}</FieldLabel>',
    ),
    (
        '<FieldLabel htmlFor="hawala-receiver-name">Name</FieldLabel>',
        '<FieldLabel htmlFor="hawala-receiver-name">{t.common.name}</FieldLabel>',
    ),
    (
        '<FieldLabel htmlFor="hawala-receiver-phone">Phone</FieldLabel>',
        '<FieldLabel htmlFor="hawala-receiver-phone">{t.common.phone}</FieldLabel>',
    ),
    (
        '<option value="">Select customer</option>',
        '<option value="">{t.hawala.selectCustomer}</option>',
    ),
    (
        '<FieldLabel htmlFor="hawala-partner">Partner Sarafi</FieldLabel>',
        '<FieldLabel htmlFor="hawala-partner">{t.hawala.partner}</FieldLabel>',
    ),
    (
        "                Add partner sarafis under Partner Sarafis first.\n",
        "                {t.hawala.addPartnersFirst}\n",
    ),
    ('<FormSection title="Corridor">', "<FormSection title={t.hawala.corridor}>"),
    ("                Origin country\n", "                {t.hawala.originCountry}\n"),
    (
        '<FieldLabel htmlFor="hawala-origin-city">Origin city</FieldLabel>',
        '<FieldLabel htmlFor="hawala-origin-city">{t.hawala.originCity}</FieldLabel>',
    ),
    (
        '<option value="">Select country</option>',
        '<option value="">{t.hawala.selectCountry}</option>',
    ),
    (
        '{form.originCountry ? "Select city" : "Select country first"}',
        "{form.originCountry ? t.hawala.selectCity : t.hawala.selectCountryFirst}",
    ),
    ('<FormSection title="Amount">', "<FormSection title={t.hawala.amountSection}>"),
    (
        '<FieldLabel htmlFor="hawala-reference">Reference number</FieldLabel>',
        '<FieldLabel htmlFor="hawala-reference">{t.hawala.referenceNumber}</FieldLabel>',
    ),
    (
        '<FieldLabel htmlFor="hawala-value-date">Value date</FieldLabel>',
        '<FieldLabel htmlFor="hawala-value-date">{t.hawala.valueDate}</FieldLabel>',
    ),
    (
        '<FieldLabel htmlFor="hawala-amount">Amount</FieldLabel>',
        '<FieldLabel htmlFor="hawala-amount">{t.common.amount}</FieldLabel>',
    ),
    (
        '<FieldLabel htmlFor="hawala-currency">Currency</FieldLabel>',
        '<FieldLabel htmlFor="hawala-currency">{t.common.currency}</FieldLabel>',
    ),
    (
        '<option value="">Select currency</option>',
        '<option value="">{t.hawala.selectCurrency}</option>',
    ),
    (
        "                Commission rate for this hawala\n",
        "                {t.hawala.commissionRate}\n",
    ),
    (
        "                Prefills from the partner default. Edit to set a rate for this\n                transfer only (applies in the hawala currency).\n",
        "                {t.hawala.commissionHint}\n",
    ),
    ("                  Fee amount\n", "                  {t.hawala.commissionFee}\n"),
    ("                  Per amount\n", "                  {t.hawala.commissionPer}\n"),
    (
        "                Leave both empty for no commission on this hawala.\n",
        "                {t.hawala.commissionEmpty}\n",
    ),
    ('<FormSection title="Notes">', "<FormSection title={t.hawala.notesSection}>"),
    (
        '<FieldLabel htmlFor="hawala-notes">Notes</FieldLabel>',
        '<FieldLabel htmlFor="hawala-notes">{t.common.notes}</FieldLabel>',
    ),
    ("          Cancel\n", "          {t.common.cancel}\n"),
    ("              Saving…\n", "              {t.hawala.saving}\n"),
    ("                Destination country\n", "                {t.hawala.destinationCountry}\n"),
    ("                Destination city\n", "                {t.hawala.destinationCity}\n"),
]

for a, b in simple:
    c = text.count(a)
    if c:
        text = text.replace(a, b)
        print(f"ok x{c}: {a[:50]}")
    else:
        print(f"MISS: {a[:70]}")

text = re.sub(
    r'form\.destinationCountry\s*\?\s*"Select city"\s*:\s*"Select country first"',
    "form.destinationCountry ? t.hawala.selectCity : t.hawala.selectCountryFirst",
    text,
)

old_sender_toggle = """              <SourceToggle
                id=\"hawala-sender-source\"
                value={form.senderSource}
                disabled={isSubmitting}
                onChange={applySenderSource}
              />"""
new_sender_toggle = """              <SourceToggle
                id=\"hawala-sender-source\"
                value={form.senderSource}
                disabled={isSubmitting}
                onChange={applySenderSource}
                customerLabel={t.hawala.existingCustomer}
                externalLabel={t.hawala.externalPerson}
                ariaLabel={t.hawala.partySource}
              />"""
old_receiver_toggle = """              <SourceToggle
                id=\"hawala-receiver-source\"
                value={form.receiverSource}
                disabled={isSubmitting}
                onChange={applyReceiverSource}
              />"""
new_receiver_toggle = """              <SourceToggle
                id=\"hawala-receiver-source\"
                value={form.receiverSource}
                disabled={isSubmitting}
                onChange={applyReceiverSource}
                customerLabel={t.hawala.existingCustomer}
                externalLabel={t.hawala.externalPerson}
                ariaLabel={t.hawala.partySource}
              />"""

for a, b, name in [
    (old_sender_toggle, new_sender_toggle, "sender"),
    (old_receiver_toggle, new_receiver_toggle, "receiver"),
]:
    if a in text:
        text = text.replace(a, b)
        print("toggle", name)
    else:
        print("toggle miss", name)

path.write_text(text, encoding="utf-8")
print("done")
