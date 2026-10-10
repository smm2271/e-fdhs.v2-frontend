import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeValidator {
  async compile(css: string, namespace: string): Promise<string> {
    const { compileThemeCss } = await import('./theme-compiler');
    try { return compileThemeCss(css, namespace); }
    catch (error) { throw new Error('CSS 格式或安全驗證失敗：' + (error instanceof Error ? error.message : '不支援的內容')); }
  }
}
