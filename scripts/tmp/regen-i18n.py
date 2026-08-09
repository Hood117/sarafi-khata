from pathlib import Path
import re

types = Path("src/lib/i18n/messages/types.ts").read_text(encoding="utf-8")
m = re.search(r"export type Dictionary = \{([\s\S]*)\n\};", types)
body = m.group(1)
sections: list[tuple[str, list[str]]] = []
i = 0
while i < len(body):
    mm = re.match(r"\s*(\w+):\s*\{", body[i:])
    if not mm:
        i += 1
        continue
    name = mm.group(1)
    start = i + mm.end() - 1
    depth = 0
    j = start
    while j < len(body):
        if body[j] == "{":
            depth += 1
        elif body[j] == "}":
            depth -= 1
            if depth == 0:
                block = body[start : j + 1]
                keys = re.findall(r"^\s+(\w+): string;", block, re.M)
                sections.append((name, keys))
                i = j + 1
                break
        j += 1
    else:
        break

print("sections", [(n, len(k)) for n, k in sections])


def extract_kv(path: Path) -> dict[str, str]:
    text = path.read_text(encoding="utf-8")
    kv: dict[str, str] = {}
    for match in re.finditer(r'(\w+):\s*"((?:\\.|[^"\\])*)"', text):
        kv[match.group(1)] = match.group(2)
    return kv


def title(key: str) -> str:
    return re.sub(r"([A-Z])", r" \1", key).strip().capitalize()


en_kv = extract_kv(Path("src/lib/i18n/messages/en.ts"))
fa_kv = extract_kv(Path("src/lib/i18n/messages/fa.ts"))
ps_kv = extract_kv(Path("src/lib/i18n/messages/ps.ts"))


def build(kv: dict[str, str], fallback: dict[str, str], loc: str) -> str:
    lines: list[str] = ['import type { Dictionary } from "@/lib/i18n/messages/types";\n\n']
    if loc == "en":
        lines.append("export const en: Dictionary = {\n")
    elif loc == "fa":
        lines.append("/** Dari — Afghanistan sarafi / desk vocabulary */\n")
        lines.append("export const fa: Dictionary = {\n")
    else:
        lines.append(
            "/** Pashto — common sarafi / business terms used in Afghanistan desks */\n"
        )
        lines.append("export const ps: Dictionary = {\n")

    for name, keys in sections:
        if name in ("brand", "shell") and len(keys) <= 2:
            parts = []
            for k in keys:
                val = kv.get(k) or fallback.get(k) or title(k)
                parts.append(f'{k}: "{val}"')
            lines.append(f"  {name}: {{ {', '.join(parts)} }},\n")
            continue
        lines.append(f"  {name}: {{\n")
        for k in keys:
            val = kv.get(k) or fallback.get(k) or title(k)
            val = val.replace("\\", "\\\\").replace('"', '\\"')
            lines.append(f'    {k}: "{val}",\n')
        lines.append("  },\n")
    lines.append("};\n")
    return "".join(lines)


Path("src/lib/i18n/messages/en.ts").write_text(build(en_kv, {}, "en"), encoding="utf-8")
Path("src/lib/i18n/messages/fa.ts").write_text(
    build(fa_kv, en_kv, "fa"), encoding="utf-8"
)
Path("src/lib/i18n/messages/ps.ts").write_text(
    build(ps_kv, en_kv, "ps"), encoding="utf-8"
)
print("regenerated ok")
for loc in ["en", "fa", "ps"]:
    t = Path(f"src/lib/i18n/messages/{loc}.ts").read_text(encoding="utf-8")
    print(loc, "lines", len(t.splitlines()))
