"""Real Chromium + IndexedDB + Cookie Sessions + TEST PostgreSQL regression.

Run from frontend: python tests/e2e_themes.py
Reuses Day 25's test-only server/actor helpers without modifying backend.
"""
import asyncio
import json
from pathlib import Path
import sys

FRONTEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(FRONTEND.parent / 'backend' / 'tests'))
import e2e_teacher_broadcast as harness
from playwright.async_api import async_playwright, expect

ARTIFACTS = FRONTEND / 'test-artifacts' / 'themes'
URL = 'https://localhost:4211'
SAMPLE = FRONTEND / 'public/themes/midnight-campus.theme.css'


async def install(page, css=None, name='test.theme.css'):
    await page.goto(URL + '/settings/themes')
    await expect(page.get_by_text('正在讀取本機主題……', exact=True)).not_to_be_visible()
    if css is None:
        await page.locator('#theme-file').set_input_files(str(SAMPLE))
    else:
        await page.locator('#theme-file').set_input_files({'name': name, 'mimeType': 'text/css', 'buffer': css.encode()})


async def flow(data):
    report = {'status': 'running', 'checks': []}
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, executable_path=p.chromium.executable_path)
        context = await browser.new_context(ignore_https_errors=True, viewport={'width': 1280, 'height': 900}, color_scheme='dark')
        await context.tracing.start(screenshots=True, snapshots=True)
        page = await context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        try:
            await page.goto(URL + '/settings/themes')
            await expect(page.get_by_role('button', name='Light', exact=True)).to_be_enabled()
            assert await page.evaluate('document.documentElement.dataset.campusMode') == 'dark'
            await page.get_by_role('button', name='Light', exact=True).click()
            await expect(page.get_by_role('button', name='Light', exact=True)).to_have_attribute('aria-pressed', 'true')
            await page.emulate_media(color_scheme='dark')
            assert await page.evaluate('document.documentElement.dataset.campusMode') == 'light'
            await page.reload()
            assert await page.evaluate('document.documentElement.dataset.campusMode') == 'light'
            report['checks'].append('system dark, manual light priority and reload bootstrap')

            await install(page)
            await expect(page.get_by_role('heading', name='Midnight Campus', exact=True)).to_be_visible()
            await page.get_by_role('button', name='啟用 Midnight Campus', exact=True).click()
            await expect(page.get_by_role('button', name='停用 Midnight Campus', exact=True)).to_be_visible()
            assert await page.locator('#campus-theme-root').evaluate('e => getComputedStyle(e).getPropertyValue("--campus-accent").trim()') == '#a6a7ff'
            await page.reload()
            await expect(page.get_by_role('button', name='停用 Midnight Campus', exact=True)).to_be_visible()
            assert await page.locator('#campus-custom-theme').count() == 1
            report['checks'].append('real file import, real IndexedDB persistence and active theme reload')
            await install(page)
            await expect(page.get_by_role('status')).to_contain_text('未重複新增')
            assert await page.locator('.theme-card').count() == 1
            update = SAMPLE.read_text(encoding='utf-8').replace('@version 1.0.0', '@version 1.1.0').replace('@name Midnight Campus', '@name Midnight Updated')
            await install(page, update)
            await expect(page.get_by_role('heading', name='Midnight Updated')).to_be_visible()
            assert await page.locator('.theme-card').count() == 1
            assert await page.locator('#campus-custom-theme').count() == 1
            report['checks'].append('duplicate deduplication and stable-ID active update after rename')

            # Theme remains active across the actual login and teacher workflow.
            await harness.login(page, 'teacher', data['teacher'])
            assert any(c['name'] == '__Host-session' and c['httpOnly'] for c in await context.cookies())
            await page.get_by_role('link', name='發布廣播', exact=True).click()
            await page.get_by_role('button', name='E2E 一年級', exact=False).click()
            await page.get_by_label('E2E 101', exact=True).check()
            message = 'Day26 theme regression ' + data['teacher']
            await page.get_by_role('textbox', name='廣播內容', exact=True).fill(message)
            await page.get_by_role('button', name='發布廣播', exact=True).click()
            await expect(page.get_by_role('dialog')).to_contain_text(message)
            await page.get_by_role('button', name='確認發布', exact=True).click()
            await expect(page).to_have_url(URL + '/broadcasts/mine')
            await expect(page.get_by_text('剛剛發布', exact=True)).to_be_visible()
            await expect(page.locator('.broadcast-card')).to_have_css('border-radius', '18px')
            await page.set_viewport_size({'width': 375, 'height': 812})
            assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            await page.screenshot(path=str(ARTIFACTS / 'teacher-themed-mobile.png'), full_page=True)
            report['checks'].append('real themed teacher login, WYSIWYG publish, management and 375px layout')

            student_context = await browser.new_context(ignore_https_errors=True, viewport={'width': 1280, 'height': 900})
            student = await student_context.new_page()
            student.on('pageerror', lambda error: errors.append(str(error)))
            await install(student)
            await student.get_by_role('button', name='啟用 Midnight Campus', exact=True).click()
            await harness.login(student, 'student', data['student'])
            await student.get_by_role('link', name='查看本週廣播', exact=True).click()
            row = student.locator('.broadcast-card').filter(has_text=message)
            await expect(row).to_be_visible()
            await expect(row).to_have_css('display', 'grid')
            await row.get_by_role('button', name='確認廣播', exact=True).or_(row.get_by_role('button', name='補確認', exact=True)).click()
            await expect(row.get_by_text('資訊股長', exact=True)).to_be_visible()
            await page.get_by_role('button', name='更新進度', exact=True).click()
            await expect(page.get_by_text('已確認 1／1 班', exact=True)).to_be_visible()
            await student.screenshot(path=str(ARTIFACTS / 'student-themed-desktop.png'), full_page=True)
            await student.set_viewport_size({'width': 375, 'height': 812})
            assert await student.evaluate('document.documentElement.scrollWidth <= innerWidth')
            await student.screenshot(path=str(ARTIFACTS / 'student-themed-mobile.png'), full_page=True)
            report['checks'].append('custom CSS changes desktop feed into cards; real student confirmation and teacher progress remain functional')

            await student.set_viewport_size({'width': 1280, 'height': 900})
            await student.goto(URL + '/')
            await expect(student.locator('.login-card')).to_have_css('border-radius', '28px')
            animation = await student.locator('.login-card').evaluate('e => getComputedStyle(e).animationName')
            assert animation.startswith('campus-')
            await student.emulate_media(reduced_motion='reduce')
            await expect(student.locator('.login-card')).to_have_css('animation-name', 'none')
            await student.screenshot(path=str(ARTIFACTS / 'login-themed.png'), full_page=True)
            report['checks'].append('CSS-only login visual/animation override and reduced-motion suppression')

            bad = '/**\n * @id evil.theme\n * @name Evil\n */\n.x{background:u\\72l(https://evil.invalid/x)}'
            await install(page, bad)
            await expect(page.get_by_role('alert')).to_contain_text('CSS 格式或安全驗證失敗')
            assert await page.locator('.theme-card').count() == 1
            report['checks'].append('escaped URL rejected by AST validation')
            await page.get_by_role('button', name='停用 Midnight Updated', exact=True).click()
            await expect(page.locator('#campus-custom-theme')).to_have_count(0)
            await page.get_by_role('button', name='刪除 Midnight Updated', exact=True).click()
            await expect(page.get_by_text('尚未安裝自訂主題。', exact=True)).to_be_visible()
            report['checks'].append('disable and delete active/local theme')

            hidden = '/**\n * @id hidden.theme\n * @name Hidden\n */\n.campus-page{display:none}'
            await install(page, hidden)
            await page.get_by_role('button', name='啟用 Hidden', exact=True).click()
            await expect(page.locator('.theme-settings')).not_to_be_visible()
            await page.locator('.campus-theme-recovery').get_by_role('link', name='主題安全模式', exact=True).click()
            await expect(page.get_by_role('heading', name='外觀設定', exact=True)).to_be_visible()
            assert await page.locator('#campus-custom-theme').count() == 0
            await page.get_by_role('button', name='恢復預設外觀', exact=True).click()
            await expect(page.get_by_role('status').last).to_contain_text('已恢復預設')
            await page.goto(URL + '/settings/themes')
            await expect(page.get_by_text('尚未安裝自訂主題。', exact=True)).to_be_visible()
            report['checks'].append('hostile visual CSS cannot hide external recovery; safe URL bypasses CSS; persistent reset repairs state')

            await install(page)
            await page.get_by_role('button', name='啟用 Midnight Campus', exact=True).click()
            await expect(page.get_by_role('button', name='停用 Midnight Campus', exact=True)).to_be_visible()
            await page.evaluate('''() => new Promise((resolve,reject) => {
              const open=indexedDB.open('campus-themes-v1',1);
              open.onsuccess=()=>{const db=open.result;const tx=db.transaction('state','readwrite');
                const store=tx.objectStore('state');const get=store.get('current');
                get.onsuccess=()=>{const state=get.result;state.themes[0].css+=' .x{background:url(https://evil.invalid)}';store.put(state,'current');};
                tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};
              open.onerror=()=>reject(open.error);
            })''')
            await page.reload()
            await expect(page.get_by_role('alert')).to_contain_text('安全預設')
            assert await page.locator('#campus-custom-theme').count() == 0
            await page.get_by_role('button', name='恢復預設外觀', exact=True).click()
            await expect(page.get_by_role('alert')).not_to_be_visible()
            report['checks'].append('tampered IndexedDB CSS fails closed and reset repairs persisted state')

            await page.evaluate("() => { IDBObjectStore.prototype.put=function(){throw new DOMException('Test quota exceeded','QuotaExceededError')}; }")
            await page.locator('#theme-file').set_input_files(str(SAMPLE))
            await expect(page.get_by_role('alert')).to_be_visible()
            assert await page.locator('.theme-card').count() == 0
            report['checks'].append('browser-side QuotaExceededError fault injection preserves previous theme state')

            # Storage failures are genuine browser API failures, not HTTP mocks.
            broken = await browser.new_context(ignore_https_errors=True, viewport={'width': 375, 'height': 812})
            await broken.add_init_script("Object.defineProperty(window,'indexedDB',{get(){throw new DOMException('Blocked','SecurityError')}})")
            broken_page = await broken.new_page()
            await broken_page.goto(URL + '/')
            await expect(broken_page.get_by_role('heading', name='帳號登入', exact=True)).to_be_visible()
            await harness.login(broken_page, 'teacher', data['teacher'])
            await broken_page.goto(URL + '/settings/themes?theme-safe=1')
            await expect(broken_page.get_by_role('heading', name='外觀設定', exact=True)).to_be_visible()
            report['checks'].append('throwing IndexedDB getter does not prevent real login; safe mode remains usable')
            assert not errors, errors
            report['status'] = 'passed'
        except BaseException:
            report['status'] = 'failed'
            await page.screenshot(path=str(ARTIFACTS / 'failure.png'), full_page=True)
            raise
        finally:
            (ARTIFACTS / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
            await context.tracing.stop(path=str(ARTIFACTS / 'trace.zip'))
            await browser.close()
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    harness.ARTIFACTS = ARTIFACTS
    harness.flow = flow
    asyncio.run(harness.main())
