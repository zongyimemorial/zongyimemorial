import time, json
from playwright.sync_api import sync_playwright

BASE = "https://zongyimemorial.com"
t0 = time.time()
def log(*a): print(f"[{time.time()-t0:.1f}s]", *a, flush=True)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1", viewport={"width":390,"height":844}, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.on("pageerror", lambda e: log("PAGEERROR:", str(e)[:120]))

    # ---- 密码登录 ----
    log("== 密码登录 ==")
    page.goto(BASE + "/login", wait_until="domcontentloaded", timeout=30000)
    page.locator('input[name="identifier"]').first.fill("user@test.com")
    page.locator('input[name="password"]').first.fill("user123456")
    page.locator("button[type=submit]").first.click()
    try:
        page.wait_for_url("**/console", timeout=30000)
        log("✅ 密码登录跳转:", page.url)
    except Exception:
        log("❌ 密码登录失败 停在:", page.url, "| 提交按钮:", page.locator("button[type=submit]").first.inner_text())
    page.screenshot(path="/workspace/.ok_pwd.png")
    page.context.clear_cookies()

    # ---- 短信登录 ----
    log("== 短信登录 ==")
    page.goto(BASE + "/login", wait_until="domcontentloaded", timeout=30000)
    # 切到短信验证码 tab
    try:
        page.get_by_role("button", name="手机验证码登录").first.click()
    except Exception:
        log("(无 tab 或已是默认)")
    phone = "13424286235"
    page.locator('input[name="phone"]').first.fill(phone)
    page.get_by_role("button", name="发送验证码").first.click()
    time.sleep(2)
    # 取 mock 码
    code = ""
    try:
        txt = page.locator("text=内测验证码").first.inner_text()
        code = txt.split("：")[-1].strip()
    except Exception:
        pass
    if not code:
        import urllib.request
        req = urllib.request.Request(BASE + "/api/auth/sms/send", data=json.dumps({"phone":phone,"purpose":"login"}).encode(), headers={"Content-Type":"application/json"}, method="POST")
        try:
            code = json.loads(urllib.request.urlopen(req, timeout=20).read())["code"]
        except Exception as e:
            log("取码失败:", e)
    log("  拿到 mock 码:", code)
    page.locator('input[name="code"]').first.fill(code)
    page.get_by_role("button", name="登录").first.click()
    try:
        page.wait_for_url("**/console", timeout=30000)
        log("✅ 短信登录跳转:", page.url)
    except Exception:
        log("❌ 短信登录失败 停在:", page.url, "| 提交按钮:", page.locator("button[type=submit]").first.inner_text())
    page.screenshot(path="/workspace/.ok_sms.png")
    b.close()
