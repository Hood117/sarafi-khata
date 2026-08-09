"""Compare en/fa/ps dictionary completeness."""
from __future__ import annotations

import re
from collections import defaultdict
from pathlib import Path

MSG = Path(__file__).resolve().parents[2] / "src" / "lib" / "i18n" / "messages"


def extract_kv(path: Path) -> dict[str, str]:
    text = path.read_text(encoding="utf-8")
    m = re.search(r"export const \w+: Dictionary = \{", text)
    if not m:
        raise SystemExit(f"no dict in {path}")
    body = text[m.end() - 1 :]
    result: dict[str, str] = {}
    stack: list[str | None] = []
    i = 0
    n = len(body)
    while i < n:
        ch = body[i]
        if ch == "{":
            stack.append(None)
            i += 1
            continue
        if ch == "}":
            if stack:
                stack.pop()
            i += 1
            continue
        km = re.match(r"(\w+)\s*:\s*", body[i:])
        if km:
            key = km.group(1)
            i += km.end()
            while i < n and body[i] in " \t\n\r":
                i += 1
            if i < n and body[i] == "{":
                stack.append(key)
                i += 1
                continue
            if i < n and body[i] in "\"'":
                quote = body[i]
                i += 1
                val_chars: list[str] = []
                while i < n:
                    if body[i] == "\\":
                        val_chars.append(body[i : i + 2])
                        i += 2
                        continue
                    if body[i] == quote:
                        i += 1
                        break
                    val_chars.append(body[i])
                    i += 1
                val = "".join(val_chars)
                path_keys = [s for s in stack if s]
                full = ".".join(path_keys + [key])
                result[full] = val
                continue
            continue
        i += 1
    return result


def looks_english(s: str) -> bool:
    if not s:
        return True
    if re.search(r"[\u0600-\u06FF]", s):
        return False
    if re.search(r"[A-Za-z]", s):
        return True
    return False


def group(keys: list[str]) -> dict[str, list[str]]:
    g: dict[str, list[str]] = defaultdict(list)
    for k in keys:
        g[k.split(".")[0]].append(k)
    return g


def main() -> None:
    en = extract_kv(MSG / "en.ts")
    fa = extract_kv(MSG / "fa.ts")
    ps = extract_kv(MSG / "ps.ts")

    print("KEY COUNTS")
    print("en", len(en))
    print("fa", len(fa))
    print("ps", len(ps))

    missing_fa = sorted(set(en) - set(fa))
    missing_ps = sorted(set(en) - set(ps))
    extra_fa = sorted(set(fa) - set(en))
    extra_ps = sorted(set(ps) - set(en))
    print("MISSING FA", len(missing_fa))
    for k in missing_fa:
        print(" ", k)
    print("MISSING PS", len(missing_ps))
    for k in missing_ps:
        print(" ", k)
    print("EXTRA FA", len(extra_fa))
    for k in extra_fa:
        print(" ", k)
    print("EXTRA PS", len(extra_ps))
    for k in extra_ps:
        print(" ", k)

    empty_fa = sorted(k for k, v in fa.items() if not v.strip())
    empty_ps = sorted(k for k, v in ps.items() if not v.strip())
    print("EMPTY FA", empty_fa)
    print("EMPTY PS", empty_ps)

    same_as_en_fa = sorted(
        k for k in en if k in fa and fa[k] == en[k] and looks_english(en[k])
    )
    same_as_en_ps = sorted(
        k for k in en if k in ps and ps[k] == en[k] and looks_english(en[k])
    )
    eng_only_fa = sorted(k for k in fa if looks_english(fa[k]) and k in en)
    eng_only_ps = sorted(k for k in ps if looks_english(ps[k]) and k in en)

    print("SAME AS EN fa", len(same_as_en_fa))
    print("SAME AS EN ps", len(same_as_en_ps))
    print("ASCII/ENGLISH-LOOKING FA", len(eng_only_fa))
    print("ASCII/ENGLISH-LOOKING PS", len(eng_only_ps))

    print("=== FA ENGLISH-LOOKING BY SECTION ===")
    for sec, keys in sorted(group(eng_only_fa).items()):
        print(f"[{sec}] {len(keys)}")
        for k in keys:
            print(f"  {k}: {fa[k]!r}  (en: {en.get(k)!r})")

    print("=== PS ENGLISH-LOOKING BY SECTION ===")
    for sec, keys in sorted(group(eng_only_ps).items()):
        print(f"[{sec}] {len(keys)}")
        for k in keys:
            print(f"  {k}: {ps[k]!r}  (en: {en.get(k)!r})")

    print("=== SECTION KEY COUNTS ===")
    for sec in sorted({k.split(".")[0] for k in en}):
        e = sum(1 for k in en if k.startswith(sec + "."))
        f = sum(1 for k in fa if k.startswith(sec + "."))
        p = sum(1 for k in ps if k.startswith(sec + "."))
        print(f"{sec}: en={e} fa={f} ps={p}")

    # Also dump keys where fa/ps differ from each other but both translated
    print("=== SAMPLE GOOD FA TERMS (hawala/partner/exchange) ===")
    for prefix in ("nav.", "hawala.", "partner.", "exchange.", "common."):
        for k in sorted(en):
            if not k.startswith(prefix):
                continue
            if looks_english(fa.get(k, "")):
                continue
            print(f"  fa {k}: {fa[k]}")
            if len([x for x in en if x.startswith(prefix) and not looks_english(fa.get(x, ""))]) > 12:
                break

    print("=== SAMPLE GOOD PS TERMS ===")
    for prefix in ("nav.", "hawala.", "partner.", "exchange.", "common."):
        shown = 0
        for k in sorted(en):
            if not k.startswith(prefix):
                continue
            if looks_english(ps.get(k, "")):
                continue
            print(f"  ps {k}: {ps[k]}")
            shown += 1
            if shown >= 8:
                break


if __name__ == "__main__":
    main()
