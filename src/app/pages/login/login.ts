import { Component, signal } from '@angular/core';

@Component({
  imports: [],
  selector: 'app-login',
  styleUrl: './login.scss',
  templateUrl: './login.html',
})
export class Login {
  protected role = signal<'teacher' | 'student'>('student');

  protected setRole(role: 'teacher' | 'student'): void {
    this.role.set(role);
  }

}
