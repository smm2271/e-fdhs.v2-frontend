"""Day 27: real Chromium, unmodified Theme Engine and TEST_DB Cookie sessions.
Run from frontend: python tests/e2e_fdhs_classic.py
Only test-owned actors/data are created and removed by the existing Day 25 harness.
"""
import asyncio
import json
from pathlib import Path
import sys

FRONTEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(FRONTEND.parent / 'backend/tests'))
import e2e_teacher_broadcast as harness
from playwright.async_api import async_playwright, expect

ARTIFACTS = FRONTEND / 'test-artifacts/fdhs-classic'
URL = 'https://localhost:4211'
THEME = FRONTEND / 'public/themes/fdhs-classic.theme.css'

async def login(page, kind, account):
    await page.goto(URL + '/')
    await page.get_by_role('button', name='教師' if kind == 'teacher' else '學生', exact=True).click()
    await page.get_by_label('帳號', exact=True).fill(account)
    if kind == 'student':
        await page.get_by_label('職務', exact=True).select_option(label='資訊股長')
    await page.get_by_label('密碼', exact=True).fill(harness.PASSWORD)
    await page.get_by_role('button', name='登入', exact=True).click()
    await expect(page).to_have_url(URL + '/broadcasts')
    await expect(page.get_by_role('heading', name='本週廣播', exact=True)).to_be_visible()

async def settings(page):
    await page.goto(URL + '/settings/themes')
    await expect(page.get_by_role('button', name='Light', exact=True)).to_be_enabled()

async def install(page):
    await settings(page)
    await page.locator('#theme-file').set_input_files(str(THEME))
    await expect(page.get_by_role('heading', name='FDHS Classic', exact=True)).to_be_visible()

async def activate(page, enabled):
    await settings(page)
    await page.get_by_role('button', name=('啟用' if enabled else '停用') + ' FDHS Classic', exact=True).click()
    await expect(page.get_by_role('button', name=('停用' if enabled else '啟用') + ' FDHS Classic', exact=True)).to_be_visible()

async def shot(page, name):
    await page.screenshot(path=str(ARTIFACTS / (name + '.png')), full_page=True)

async def no_overflow(page):
    assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Whole-page horizontal overflow'

async def login_style(page):
    return await page.locator('.campus-login').evaluate('''e => [e, ...e.querySelectorAll('*')].map(n => {
      const s=getComputedStyle(n); return [n.tagName, s.color, s.backgroundColor, s.fontFamily,
      s.fontSize, s.padding, s.borderRadius, s.borderColor, s.boxShadow, s.width, s.height, s.colorScheme];
    })''')

async def publish(page, text, grade_id):
    await page.goto(URL + '/broadcasts/new')
    await page.locator(f'[aria-controls="grade-{grade_id}"]').click()
    await page.locator(f'[id="grade-{grade_id}"]').get_by_label('E2E 101', exact=True).check()
    await page.get_by_role('textbox', name='廣播內容', exact=True).fill(text)
    await page.get_by_role('button', name='發布廣播', exact=True).click()
    for line in text.splitlines():
        await expect(page.get_by_role('dialog')).to_contain_text(line)
    await page.get_by_role('button', name='確認發布', exact=True).click()
    await expect(page).to_have_url(URL + '/broadcasts/mine')

async def flow(data):
    report = {'status': 'running', 'checks': [], 'viewport': {'desktop': [1440, 900], 'mobile': [375, 812]}, 'http_mocking': False}
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(ignore_https_errors=True, viewport={'width': 1440, 'height': 900}, color_scheme='light')
        student_context = await browser.new_context(ignore_https_errors=True, viewport={'width': 1440, 'height': 900}, color_scheme='light')
        await context.tracing.start(screenshots=True, snapshots=True)
        teacher = await context.new_page()
        student = await student_context.new_page()
        errors = []
        teacher.on('pageerror', lambda error: errors.append(str(error)))
        student.on('pageerror', lambda error: errors.append(str(error)))
        try:
            for mode in ['light', 'dark']:
                await settings(teacher)
                await teacher.get_by_role('button', name=mode.capitalize(), exact=True).click()
                await teacher.goto(URL + '/')
                before = await login_style(teacher)
                await shot(teacher, 'login-' + mode + '-before')
                if mode == 'light':
                    await install(teacher)
                await activate(teacher, True)
                await teacher.goto(URL + '/')
                assert await login_style(teacher) == before, 'Classic must not change login computed styles'
                await shot(teacher, 'login-' + mode + '-after')
                await activate(teacher, False)
            report['checks'].append('Login computed styles unchanged in both Light and Dark; paired screenshots')
            await settings(teacher)
            await teacher.get_by_role('button', name='Light', exact=True).click()
            await login(teacher, 'teacher', data['teacher'])
            cookies = await context.cookies()
            assert any(c['name'] == '__Host-session' and c['secure'] and c['httpOnly'] for c in cookies)
            await teacher.goto(URL + '/broadcasts/new')
            await shot(teacher, 'teacher-publish-before')
            await activate(teacher, True)
            await teacher.goto(URL + '/broadcasts/new')
            await shot(teacher, 'teacher-publish-after')
            await teacher.set_viewport_size({'width': 375, 'height': 812})
            await no_overflow(teacher)
            await shot(teacher, 'teacher-publish-mobile-after')
            await teacher.set_viewport_size({'width': 1440, 'height': 900})
            message = 'Day27 經典主題 ' + data['teacher'] + '：請各班資訊股長確認本週通知。'
            await publish(teacher, message, data['group_ids'][3])
            await publish(teacher, '長篇廣播測試：' + '請同學詳閱通知並保留完整內容。' * 45 + '\nhttps://example.invalid/' + 'long-text-' * 30, data['group_ids'][3])
            await teacher.reload()
            await teacher.locator('.broadcast-card').first.locator('summary').click()
            await shot(teacher, 'teacher-mine-after')
            await activate(teacher, False)
            await teacher.goto(URL + '/broadcasts/mine')
            await teacher.locator('.broadcast-card').first.locator('summary').click()
            await shot(teacher, 'teacher-mine-before')
            await activate(teacher, True)
            await teacher.goto(URL + '/broadcasts/mine')
            report['checks'].append('Real Secure HttpOnly Cookie teacher login, selection, preview, publication and management')

            await login(student, 'student', data['student'])
            await expect(student.locator('.broadcast-card')).to_have_count(2)
            await shot(student, 'student-desktop-before')
            await student.set_viewport_size({'width': 375, 'height': 812})
            await shot(student, 'student-mobile-before')
            await install(student)
            await activate(student, True)
            await student.set_viewport_size({'width': 1440, 'height': 900})
            await student.goto(URL + '/broadcasts')
            await expect(student.locator('.broadcast-card')).to_have_count(2)
            rows = student.locator('.broadcast-card')
            await student.mouse.move(0, 0)
            colors = await rows.evaluate_all('es => es.map(e => getComputedStyle(e).backgroundColor)')
            assert set(colors) == {'rgb(208, 224, 207)', 'rgb(201, 216, 222)'}, colors
            await expect(student.locator('.feed-table thead th').first).to_have_css('background-color', 'rgb(75, 119, 69)')
            await expect(rows.first).to_have_css('display', 'table-row')
            await no_overflow(student)
            await shot(student, 'student-desktop-after')
            report['checks'].append('Desktop native table, green header, alternating rows, left CSS tree navigation and full content')

            navigations = []
            student.on('framenavigated', lambda f: navigations.append(f.url) if f == student.main_frame else None)
            sync_message = 'Day27 Hash Window 同步 ' + data['teacher']
            await publish(teacher, sync_message, data['group_ids'][3])
            synced = student.locator('.broadcast-card').filter(has_text=sync_message)
            await expect(synced).to_be_visible(timeout=45000)
            assert not navigations, 'Hash discovery must occur without reload'
            row = student.locator('.broadcast-card').filter(has_text=message)
            await row.get_by_role('button', name='確認廣播', exact=True).or_(row.get_by_role('button', name='補確認', exact=True)).click()
            await expect(row.get_by_text('資訊股長', exact=True)).to_be_visible()
            await row.get_by_role('button', name='的廣播，回覆', exact=False).click()
            reply = 'Classic 主題下確認與回覆正常。'
            await student.locator('.reply-row:not([hidden])').get_by_label('新增回覆', exact=True).fill(reply)
            await student.locator('.reply-row:not([hidden])').get_by_role('button', name='送出回覆', exact=True).click()
            await expect(student.get_by_text(reply, exact=True)).to_be_visible()
            await teacher.get_by_role('button', name='更新進度', exact=True).click()
            await expect(teacher.locator('.broadcast-card').filter(has_text=message)).to_contain_text('已確認 1／1 班')
            report['checks'].append('Real 30-second Hash Window discovery without reload, officer confirmation, reply and teacher progress')

            for width in [375, 320, 768]:
                await student.set_viewport_size({'width': width, 'height': 812})
                await no_overflow(student)
                await expect(row).to_have_css('display', 'grid')
            await student.set_viewport_size({'width': 375, 'height': 812})
            await shot(student, 'student-mobile-after')
            await student.locator('.reply-toggle').first.focus()
            await student.keyboard.press('Tab')
            await student.keyboard.press('Shift+Tab')
            assert await student.locator('.reply-toggle').first.evaluate('e => getComputedStyle(e).outlineStyle') != 'none'
            await student.emulate_media(reduced_motion='reduce')
            assert await row.evaluate('e => getComputedStyle(e).transitionDuration') == '0s'
            await teacher.set_viewport_size({'width': 375, 'height': 812})
            await no_overflow(teacher)
            await shot(teacher, 'teacher-mine-mobile-after')
            report['checks'].append('320/375/768px card layout and long text without overflow; visible keyboard focus and reduced motion')

            await activate(student, False)
            await student.goto(URL + '/broadcasts')
            await expect(student.get_by_text('資訊股長', exact=True)).to_be_visible()
            await student.locator('.broadcast-card').filter(has_text=message).locator('.reply-toggle').click()
            await expect(student.get_by_text(reply, exact=True)).to_be_visible()
            await activate(student, True)
            await student.reload()
            await expect(student.get_by_role('button', name='停用 FDHS Classic', exact=True)).to_be_visible()
            await student.set_viewport_size({'width': 1440, 'height': 900})
            await shot(student, 'settings-desktop-after')
            await student.set_viewport_size({'width': 375, 'height': 812})
            await no_overflow(student)
            await shot(student, 'settings-mobile-after')
            await activate(student, False)
            await shot(student, 'settings-mobile-before')
            await student.set_viewport_size({'width': 1440, 'height': 900})
            await shot(student, 'settings-desktop-before')
            await activate(student, True)
            await student.goto(URL + '/settings/themes?theme-safe=1')
            await expect(student.get_by_role('heading', name='外觀設定', exact=True)).to_be_visible()
            assert await student.locator('#campus-custom-theme').count() == 0
            await student.goto(URL + '/settings/themes')
            await expect(student.get_by_role('button', name='停用 FDHS Classic', exact=True)).to_be_visible()
            await student.get_by_role('button', name='刪除 FDHS Classic', exact=True).click()
            await expect(student.get_by_text('尚未安裝自訂主題。', exact=True)).to_be_visible()
            assert await student.locator('#campus-custom-theme').count() == 0
            report['checks'].append('Theme switch preserves confirmed/replied data; IndexedDB reload, safe bypass, active deletion and paired settings screenshots')
            assert not errors, errors
            report['status'] = 'passed'
        except BaseException:
            report['status'] = 'failed'
            await shot(student, 'failure-student')
            await shot(teacher, 'failure-teacher')
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
