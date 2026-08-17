"""Visual smoke for the T07 operations incident queue contract shell."""

from pathlib import Path
from playwright.sync_api import sync_playwright


OUTPUT = Path("dist/t07-visual-smoke")
OUTPUT.mkdir(parents=True, exist_ok=True)

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    for name, size in (
        ("desktop", {"width": 1440, "height": 1000}),
        ("tablet", {"width": 900, "height": 1100}),
        ("mobile", {"width": 390, "height": 844}),
    ):
        page = browser.new_page(viewport=size)
        page.set_default_timeout(120_000)
        errors = []
        page.on(
            "console",
            lambda message: errors.append(message.text)
            if message.type == "error"
            else None,
        )
        page.goto(
            "http://127.0.0.1:3001/incidents",
            wait_until="domcontentloaded",
            timeout=120_000,
        )
        page.wait_for_load_state("networkidle", timeout=120_000)
        page.get_by_role("heading", name="Tiếp nhận SOS").wait_for()
        page.screenshot(path=str(OUTPUT / f"ops-{name}.png"), full_page=True)
        assert not errors, f"{name} console errors: {errors}"
        assert page.locator("body").evaluate(
            "el => el.scrollWidth <= window.innerWidth"
        ), f"{name} has horizontal overflow"
        assert page.get_by_text("Synthetic local", exact=True).is_visible()
        page.close()
    browser.close()

print(f"T07 visual smoke passed; screenshots: {OUTPUT.resolve()}")
