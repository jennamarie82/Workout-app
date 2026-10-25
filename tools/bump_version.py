"""Bump the app version after changing any file in app/.

Updates VERSION in app/sw.js and every ?v= in app/index.html to the same number,
so phones fetch the new files together instead of a mix of old and new.

Run from the project root:  python3 tools/bump_version.py
"""
import os
import re

root = os.path.join(os.path.dirname(__file__), "..", "app")
sw_path = os.path.join(root, "sw.js")
html_path = os.path.join(root, "index.html")

sw = open(sw_path).read()
version = int(re.search(r"const VERSION = (\d+);", sw).group(1)) + 1
open(sw_path, "w").write(re.sub(r"const VERSION = \d+;", f"const VERSION = {version};", sw))

html = open(html_path).read()
open(html_path, "w").write(re.sub(r"\?v=\d+", f"?v={version}", html))

print("app version is now", version)
