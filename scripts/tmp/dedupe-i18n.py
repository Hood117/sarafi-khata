from pathlib import Path
import re


def strip_duplicate_lines_in_sections(path: Path) -> None:
    """Within each top-level Dictionary section, keep the last occurrence of each key line."""
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines(keepends=True)

    # Find export const ... = {
    start = None
    for i, line in enumerate(lines):
        if "Dictionary = {" in line:
            start = i
            break
    if start is None:
        print("no dictionary", path)
        return

    out = lines[: start + 1]
    i = start + 1
    while i < len(lines):
        line = lines[i]
        # end of root
        if line.startswith("};") or (line.strip() == "}" and i > start + 2):
            # check if this is root close - Dictionary ends with };
            out.extend(lines[i:])
            break

        m = re.match(r"^  (\w+): \{\s*$", line)
        m_inline = re.match(r"^  (\w+): \{.*\},\s*$", line)
        if m_inline:
            out.append(line)
            i += 1
            continue
        if m:
            section_name = m.group(1)
            out.append(line)
            i += 1
            section_lines = []
            while i < len(lines):
                sl = lines[i]
                if re.match(r"^  \},?\s*$", sl):
                    # close section
                    # dedupe section_lines by key
                    last_for_key: dict[str, str] = {}
                    order: list[str] = []
                    other: list[str] = []
                    for sl2 in section_lines:
                        km = re.match(r"^    (\w+):", sl2)
                        if km:
                            key = km.group(1)
                            if key not in last_for_key:
                                order.append(key)
                            last_for_key[key] = sl2
                        else:
                            other.append(sl2)
                    dups = [k for k in order if section_lines.count.__self__]
                    # rebuild
                    rebuilt = [last_for_key[k] for k in order]
                    # ensure trailing commas
                    fixed = []
                    for j, rl in enumerate(rebuilt):
                        if not rl.rstrip().endswith(",") and j < len(rebuilt) - 1:
                            rl = rl.rstrip("\n") + ",\n"
                        fixed.append(rl)
                    # detect dups
                    keys = [re.match(r"^    (\w+):", x).group(1) for x in section_lines if re.match(r"^    (\w+):", x)]
                    if len(keys) != len(set(keys)):
                        print(path.name, section_name, "removed dups", sorted({k for k in keys if keys.count(k) > 1}))
                    out.extend(fixed)
                    out.append(sl)
                    i += 1
                    break
                section_lines.append(sl)
                i += 1
            continue

        out.append(line)
        i += 1

    path.write_text("".join(out), encoding="utf-8")
    print("wrote", path)


for loc in ["en", "fa", "ps"]:
    strip_duplicate_lines_in_sections(Path(f"src/lib/i18n/messages/{loc}.ts"))
