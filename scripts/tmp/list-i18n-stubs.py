import re
import pathlib

root = pathlib.Path(r"E:\Saraf\Saraf\src\lib\i18n\messages")
en = (root / "en.ts").read_text(encoding="utf-8")
fa = (root / "fa.ts").read_text(encoding="utf-8")
ps = (root / "ps.ts").read_text(encoding="utf-8")


def parse(src: str) -> dict[str, str]:
    items: dict[str, str] = {}
    stack: list[tuple[int, str]] = []
    for line in src.splitlines():
        m = re.match(r"^(\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:\s*\{", line)
        if m:
            indent = len(m.group(1))
            while stack and stack[-1][0] >= indent:
                stack.pop()
            stack.append((indent, m.group(2)))
            continue
        m = re.match(r"""^(\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(["'])(.*?)\3""", line)
        if m:
            indent = len(m.group(1))
            while stack and stack[-1][0] >= indent:
                stack.pop()
            path = ".".join([s[1] for s in stack] + [m.group(2)])
            items[path] = m.group(4)
    return items


en_d, fa_d, ps_d = parse(en), parse(fa), parse(ps)
arabic = re.compile(r"[\u0600-\u06FF]")
allow_latin = {"common.pdf", "common.excel", "common.csv", "common.net", "dailyBook.net"}

stubs = []
for k, v in sorted(en_d.items()):
    fv = fa_d.get(k, "")
    pv = ps_d.get(k, "")
    if k in allow_latin:
        continue
    if not arabic.search(fv) or not arabic.search(pv):
        stubs.append((k, v, fv, pv))

out = pathlib.Path(r"E:\Saraf\Saraf\scripts\tmp\i18n-stubs.txt")
lines = [f"Total keys: {len(en_d)}", f"Stubs: {len(stubs)}", ""]
cur = None
for k, v, fv, pv in stubs:
    sec = k.split(".")[0]
    if sec != cur:
        cur = sec
        lines.append(f"\n## {sec}")
    lines.append(f"{k}\tEN={v}\tFA={fv}\tPS={pv}")
out.write_text("\n".join(lines), encoding="utf-8")
print(f"Wrote {len(stubs)} stubs to {out}")
