import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = ROOT / "docs" / "uat" / "evidence"
EVIDENCE.mkdir(parents=True, exist_ok=True)


def collect_errors(page):
    errors = []
    page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
    page.on("pageerror", lambda error: errors.append(str(error)))
    return errors


def open_workspace(page):
    page.set_default_timeout(60_000)
    page.set_default_navigation_timeout(60_000)
    page.goto(
        "http://127.0.0.1:3001/incidents",
        wait_until="domcontentloaded",
    )
    page.wait_for_load_state("networkidle")


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)

    desktop = browser.new_page(viewport={"width": 1440, "height": 1000})
    desktop_errors = collect_errors(desktop)
    open_workspace(desktop)
    desktop.get_by_role("heading", name="Tin báo trong phạm vi").wait_for()
    assert desktop.locator(".ops-queue-item").count() == 3
    desktop.get_by_role("button", name="Khẩn cấp").click()
    assert desktop.locator(".ops-queue-item").count() == 2
    second_queue_item = desktop.locator(".ops-queue-item").nth(1)
    second_queue_item.focus()
    second_queue_item.press("Enter")
    assert second_queue_item.evaluate(
        "element => getComputedStyle(element).outlineStyle"
    ) != "none"
    assert desktop.get_by_role("heading", name="Yêu cầu cứu nạn").is_visible()
    desktop.get_by_role("button", name="Kiểm tra lại mẫu").click()
    assert "Không có yêu cầu mạng" in desktop.locator("#fixture-status").text_content()
    desktop.screenshot(path=str(EVIDENCE / "t14a-ops-desktop.png"), full_page=True)

    mobile = browser.new_page(viewport={"width": 390, "height": 844})
    mobile_errors = collect_errors(mobile)
    open_workspace(mobile)
    mobile.get_by_role("heading", name="Tin báo trong phạm vi").wait_for()
    overflow = mobile.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    assert overflow <= 1
    mobile.screenshot(path=str(EVIDENCE / "t14a-ops-mobile.png"), full_page=True)

    reduced = browser.new_context(
        viewport={"width": 1024, "height": 768}, reduced_motion="reduce"
    )
    reduced_page = reduced.new_page()
    open_workspace(reduced_page)
    animation = reduced_page.locator(".ops-freshness-state i").evaluate(
        "element => getComputedStyle(element).animationName"
    )
    assert animation == "none"
    reduced.close()

    browser.close()

    assert not desktop_errors, desktop_errors
    assert not mobile_errors, mobile_errors
    print(
        json.dumps(
            {
                "desktop_queue_after_filter": 2,
                "mobile_overflow_px": overflow,
                "reduced_motion_animation": animation,
                "console_errors": 0,
                "screenshots": [
                    os.fspath(EVIDENCE / "t14a-ops-desktop.png"),
                    os.fspath(EVIDENCE / "t14a-ops-mobile.png"),
                ],
            },
            ensure_ascii=False,
        )
    )
