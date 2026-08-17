"""Local visual smoke for the two T06 contract shells."""

from pathlib import Path
from playwright.sync_api import sync_playwright


OUTPUT = Path("dist/t06-visual-smoke")
OUTPUT.mkdir(parents=True, exist_ok=True)

routes = [
    ("ops", "http://127.0.0.1:3001/map-data", "Điểm đen nguy hiểm"),
    ("citizen", "http://127.0.0.1:3002", "Đi đúng."),
]

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    for name, url, heading in routes:
        for viewport_name, size in (
            ("desktop", {"width": 1440, "height": 1000}),
            ("mobile", {"width": 390, "height": 844}),
        ):
            page = browser.new_page(viewport=size)
            page.set_default_timeout(120_000)
            errors = []
            page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
            page.goto(url, wait_until="domcontentloaded", timeout=120_000)
            page.wait_for_load_state("networkidle", timeout=120_000)
            page.get_by_role("heading", name=heading).wait_for()
            page.screenshot(path=str(OUTPUT / f"{name}-{viewport_name}.png"), full_page=True)
            assert not errors, f"{name}/{viewport_name} console errors: {errors}"
            assert page.locator("body").evaluate("el => el.scrollWidth <= window.innerWidth"), (
                f"{name}/{viewport_name} has horizontal overflow"
            )
            page.close()
    browser.close()

print(f"T06 visual smoke passed; screenshots: {OUTPUT.resolve()}")
