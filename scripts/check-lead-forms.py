#!/usr/bin/env python3
"""Fail if lead forms regress to a placeholder inbox, a fake phone, or a missing local asset."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEXT_SUFFIXES = {".html", ".js", ".mjs", ".css", ".json", ".md", ".txt", ".xml", ".yml", ".yaml", ".svg"}
SKIP_DIRS = {".git", "node_modules"}

# Needles are split so this file does not contain the blocked strings itself.
BLOCKED = (
    "form" + "spree",
    "YOUR_" + "FORM_ID",
    "REPLACE_" + "WITH",
    "555" + "-",
    "X-TDP-" + "Lead-Secret",
)

TAG_RE = re.compile(r"<([a-zA-Z0-9]+)\b([^>]*)>", re.I)
ATTR_RE = re.compile(r"""([:\w-]+)\s*=\s*(['"])(.*?)\2""", re.I)
FORM_RE = re.compile(r"<form\b([^>]*)>", re.I)
ASSET_TAGS = {"script": "src", "img": "src", "source": "src"}


def iter_text_files(root: Path):
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        if path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        yield path


def attrs(raw: str) -> dict[str, str]:
    return {match.group(1).lower(): match.group(3) for match in ATTR_RE.finditer(raw)}


def is_external(url: str) -> bool:
    lowered = url.strip().lower()
    return (
        not lowered
        or lowered.startswith("#")
        or lowered.startswith("mailto:")
        or lowered.startswith("tel:")
        or lowered.startswith("javascript:")
        or lowered.startswith("data:")
        or lowered.startswith("http://")
        or lowered.startswith("https://")
        or lowered.startswith("//")
    )


def local_target(html_path: Path, url: str) -> Path | None:
    cleaned = url.split("#", 1)[0].split("?", 1)[0].strip()
    if is_external(cleaned) or cleaned in {"", "/"}:
        return None
    if cleaned.startswith("/"):
        return ROOT / cleaned.lstrip("/")
    return (html_path.parent / cleaned).resolve()


def main() -> int:
    failures: list[str] = []

    for path in iter_text_files(ROOT):
        text = path.read_text(encoding="utf-8", errors="replace")
        rel = path.relative_to(ROOT).as_posix()
        for needle in BLOCKED:
            if needle in text or needle.lower() in text.lower():
                failures.append(f"{rel} contains blocked placeholder {needle!r}")

        if path.suffix.lower() != ".html":
            continue

        for tag, body in TAG_RE.findall(text):
            tag = tag.lower()
            found = attrs(body)
            url = None
            if tag in ASSET_TAGS and ASSET_TAGS[tag] in found:
                url = found[ASSET_TAGS[tag]]
            elif tag == "link" and "stylesheet" in found.get("rel", "").lower():
                url = found.get("href")
            if not url:
                continue
            target = local_target(path, url)
            if target is None:
                continue
            if not target.is_file():
                failures.append(f"{rel} missing local asset {url} (expected {target})")

        if "<form" not in text.lower():
            continue
        if "tdp-leads.js" not in text:
            failures.append(f"{rel} has a form but does not load /js/tdp-leads.js")
        if 'name="company_website"' not in text and "name='company_website'" not in text:
            failures.append(f"{rel} form is missing the company_website honeypot")
        for body in FORM_RE.findall(text):
            if "action" in attrs(body):
                failures.append(f"{rel} form still has an action attribute")

    leads = ROOT / "js" / "tdp-leads.js"
    if not leads.is_file():
        failures.append("js/tdp-leads.js is missing")
    else:
        script = leads.read_text(encoding="utf-8")
        if "63e7470e-fe1e-4367-aae0-56d0d6392d78" not in script:
            failures.append("js/tdp-leads.js is missing the TradeDeskPro profile id")
        if "https://www.tradedeskpro.com/api/leads" not in script:
            failures.append("js/tdp-leads.js is missing the lead intake URL")

    if failures:
        print("Lead form check failed:", file=sys.stderr)
        for item in failures:
            print(f"- {item}", file=sys.stderr)
        return 1

    print("Lead form check passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
