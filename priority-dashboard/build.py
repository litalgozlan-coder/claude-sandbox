# Builds project-dashboard.html from the template and a data JSON file.
import sys
data = sys.argv[1] if len(sys.argv) > 1 else "demo-data.json"
t = open("dashboard-template.html", encoding="utf-8").read()
d = open(data, encoding="utf-8").read()
open("project-dashboard.html", "w", encoding="utf-8").write(t.replace("/*DATA*/", d))
