
import json
from pathlib import Path

notebook_dir = (
    Path("modeling")
    / "semRAUT-dea_modeling"
    / "script modeling"
)

for notebook_path in notebook_dir.glob("*.ipynb"):
    print("\n" + "=" * 80)
    print(f"NOTEBOOK: {notebook_path.name}")
    print("=" * 80)

    with open(notebook_path, "r", encoding="utf-8") as f:
        notebook = json.load(f)

    for cell_number, cell in enumerate(notebook.get("cells", []), start=1):
        if cell.get("cell_type") == "markdown":
            cell_type = "MARKDOWN"
        elif cell.get("cell_type") == "code":
            cell_type = "CODE"
        else:
            continue

        source = "".join(cell.get("source", []))

        if source.strip():
            print(f"\n--- CELL {cell_number} [{cell_type}] ---")
            print(source[:2500])

print("\nSELESAI MEMBACA NOTEBOOK")
