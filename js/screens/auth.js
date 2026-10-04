// js/screens/auth.js

import { TopBar } from '../components/TopBar.js';
import { TextField } from '../components/TextField.js';
import { Button } from '../components/Button.js';
import { SegmentedControl } from '../components/SegmentedControl.js';
import { showToast } from '../components/Toast.js';
import { isConfigured, getSession, signIn, signUp, recover, updatePassword, changePassword } from '../sync/auth.js';
import { syncNow } from '../sync/sync.js';
import { takePendingAuthMode, takePendingAuthNotice } from '../state.js';
import { injectStyle } from '../utils/dom.js';

const CSS = `
.auth { display: flex; flex-direction: column; gap: var(--space-4); padding-top: var(--space-4); }
.auth__brand { display: flex; flex-direction: column; align-items: center; gap: var(--space-2); text-align: center; padding-bottom: var(--space-2); }
.auth__logo { display: grid; place-items: center; width: 56px; height: 56px; border-radius: var(--radius-lg); background: var(--gradient-accent); color: var(--color-on-accent); font-weight: var(--weight-bold); font-size: var(--text-h2); }
.auth__lead { color: var(--color-text-secondary); max-width: 32ch; }
.auth__divider { display: flex; align-items: center; gap: var(--space-3); color: var(--color-text-muted); font-size: var(--text-caption); }
.auth__divider::before, .auth__divider::after { content: ""; flex: 1; height: 1px; background: var(--color-border); }
.auth__soon { text-align: center; color: var(--color-text-muted); font-size: var(--text-caption); }
.auth__link { align-self: center; min-height: var(--tap-target); padding: 0 var(--space-3); color: var(--color-accent); font-weight: var(--weight-semibold); }
.auth__note { padding: var(--space-3); border-radius: var(--radius-md); background: var(--color-warning-soft); color: var(--color-text); font-size: var(--text-caption); }`;

export default async function auth(view, params, ctx) {
  injectStyle('screen-auth', CSS);

  let mode = takePendingAuthMode() || 'signin'; // signin | signup | forgot | sent | reset | change
  let sentText = '';
  let notice = takePendingAuthNotice();

  const root = document.createElement('div');
  root.className = 'screen';
  root.append(TopBar({ title: '', onBack: () => ctx.back('/profile') }));
  const body = document.createElement('div');
  body.className = 'screen__body';
  root.append(body);
  view.append(root);

  function brand(title, lead) {
    const wrap = document.createElement('div');
    wrap.className = 'auth__brand';
    const logo = document.createElement('div');
    logo.className = 'auth__logo';
    logo.textContent = 'Ed';
    const h = document.createElement('h2');
    h.className = 'text-h1';
    h.textContent = title;
    const p = document.createElement('p');
    p.className = 'auth__lead';
    p.textContent = lead;
    wrap.append(logo, h, p);
    return wrap;
  }

  function note(text) {
    const n = document.createElement('p');
    n.className = 'auth__note';
    n.textContent = text;
    return n;
  }

  function render() {
    const wrap = document.createElement('div');
    wrap.className = 'auth';

    if (!isConfigured()) {
      wrap.append(
        brand('Cloud sync', 'Sync is not set up in this build yet. EdMedia works fully on this device without it.'),
        Button({ label: 'Continue without an account', variant: 'primary', full: true, onClick: () => ctx.navigate('/') })
      );
      body.replaceChildren(wrap);
      return;
    }

    if (mode === 'sent') {
      wrap.append(
        brand('Check your email', sentText),
        getSession()
          ? Button({ label: 'Back to profile', variant: 'secondary', full: true, onClick: () => ctx.navigate('/profile') })
          : Button({ label: 'Back to sign in', variant: 'secondary', full: true, onClick: () => { mode = 'signin'; render(); } })
      );
      body.replaceChildren(wrap);
      return;
    }

    if (mode === 'change') {
      const session = getSession();
      if (!session) { mode = 'signin'; render(); return; }
      const current = TextField({ label: 'Current password', type: 'password', autocomplete: 'current-password' });
      const pw = TextField({ label: 'New password', type: 'password', autocomplete: 'new-password' });
      const pw2 = TextField({ label: 'Confirm new password', type: 'password', autocomplete: 'new-password' });
      const submit = Button({
        label: 'Change password', variant: 'primary', full: true,
        async onClick() {
          [current, pw, pw2].forEach((f) => f.hint.set('neutral', ''));
          if (!current.input.value) { current.hint.set('danger', 'Enter your current password.'); return; }
          if (pw.input.value.length < 6) { pw.hint.set('danger', 'Use at least 6 characters.'); return; }
          if (pw.input.value === current.input.value) { pw.hint.set('danger', 'Choose a different password.'); return; }
          if (pw.input.value !== pw2.input.value) { pw2.hint.set('danger', 'Passwords do not match.'); return; }
          submit.disabled = true;
          try { await changePassword(current.input.value, pw.input.value); showToast('Password changed'); ctx.navigate('/profile'); }
          catch (err) {
            const wrong = /current password/i.test(err.message);
            (wrong ? current : pw).hint.set('danger', err.message);
            submit.disabled = false;
          }
        },
      });
      const forgotCurrent = document.createElement('button');
      forgotCurrent.type = 'button';
      forgotCurrent.className = 'auth__link';
      forgotCurrent.textContent = 'Forgot your current password?';
      forgotCurrent.addEventListener('click', async () => {
        forgotCurrent.disabled = true;
        try { await recover(session.user.email); sentText = 'We sent a password reset link to ' + session.user.email + '.'; mode = 'sent'; render(); }
        catch (err) { showToast(err.message, 'danger'); forgotCurrent.disabled = false; }
      });
      wrap.append(brand('Change password', 'Enter your current password, then choose a new one.'), current.el, pw.el, pw2.el, submit, forgotCurrent);
      body.replaceChildren(wrap);
      return;
    }

    if (mode === 'reset') {
      const pw = TextField({ label: 'New password', type: 'password', autocomplete: 'new-password' });
      const pw2 = TextField({ label: 'Confirm password', type: 'password', autocomplete: 'new-password' });
      const submit = Button({
        label: 'Reset password', variant: 'primary', full: true,
        async onClick() {
          if (pw.input.value.length < 6) { pw.hint.set('danger', 'Use at least 6 characters.'); return; }
          if (pw.input.value !== pw2.input.value) { pw2.hint.set('danger', 'Passwords do not match.'); return; }
          submit.disabled = true;
          try { await updatePassword(pw.input.value); showToast('Password updated'); syncNow(); ctx.navigate('/profile'); }
          catch (err) { pw.hint.set('danger', err.message); submit.disabled = false; }
        },
      });
      wrap.append(brand('Reset password', 'Choose a new password for your account.'), pw.el, pw2.el, submit);
      body.replaceChildren(wrap);
      return;
    }

    if (mode === 'forgot') {
      const email = TextField({ label: 'Email', type: 'email', autocomplete: 'email' });
      const submit = Button({
        label: 'Send reset link', variant: 'primary', full: true,
        async onClick() {
          const value = email.input.value.trim();
          if (!value) { email.hint.set('danger', 'Enter your email.'); return; }
          submit.disabled = true;
          try { await recover(value); sentText = 'We sent a password reset link to ' + value + '.'; mode = 'sent'; render(); }
          catch (err) { email.hint.set('danger', err.message); submit.disabled = false; }
        },
      });
      wrap.append(
        brand('Forgot password', 'Enter your email and we will send you a reset link.'),
        ...(notice ? [note(notice)] : []), email.el, submit,
        Object.assign(Button({ label: 'Back to sign in', variant: 'ghost', full: true, onClick: () => { mode = 'signin'; render(); } }))
      );
      body.replaceChildren(wrap);
      return;
    }

    const signup = mode === 'signup';
    const tabs = SegmentedControl({
      ariaLabel: 'Sign in or create account', value: mode,
      options: [{ value: 'signin', label: 'Sign in' }, { value: 'signup', label: 'Create account' }],
      onChange(v) { mode = v; render(); },
    });
    const email = TextField({ label: 'Email', type: 'email', autocomplete: 'email' });
    const pw = TextField({ label: 'Password', type: 'password', autocomplete: signup ? 'new-password' : 'current-password' });
    const submit = Button({
      label: signup ? 'Create account' : 'Sign in', variant: 'primary', full: true,
      async onClick() {
        const e = email.input.value.trim();
        const p = pw.input.value;
        email.hint.set('neutral', '');
        pw.hint.set('neutral', '');
        if (!e) { email.hint.set('danger', 'Enter your email.'); return; }
        if (p.length < 6) { pw.hint.set('danger', 'Use at least 6 characters.'); return; }
        submit.disabled = true;
        try {
          if (signup) {
            const result = await signUp(e, p);
            if (result.needsConfirm) { sentText = 'We sent a confirmation link to ' + e + '. Open it, then sign in.'; mode = 'sent'; render(); return; }
          } else {
            await signIn(e, p);
          }
          showToast(signup ? 'Account created' : 'Signed in');
          ctx.navigate('/profile');
        } catch (err) {
          pw.hint.set('danger', err.message);
          submit.disabled = false;
        }
      },
    });
    const google = Button({ label: 'Continue with Google', variant: 'secondary', full: true, disabled: true });
    const soon = document.createElement('p');
    soon.className = 'auth__soon';
    soon.textContent = 'Google sign-in is coming soon.';
    const divider = document.createElement('div');
    divider.className = 'auth__divider';
    divider.textContent = 'or';
    const forgot = document.createElement('button');
    forgot.type = 'button';
    forgot.className = 'auth__link';
    forgot.textContent = 'Forgot password?';
    forgot.addEventListener('click', () => { mode = 'forgot'; render(); });
    const skip = Button({ label: 'Continue without an account', variant: 'ghost', full: true, onClick: () => ctx.navigate('/') });

    wrap.append(
      brand('EdMedia', 'Sign in to sync your templates and logos across devices.'),
      tabs.el, email.el, pw.el, submit
    );
    if (!signup) wrap.append(forgot);
    wrap.append(divider, google, soon, skip);
    body.replaceChildren(wrap);
  }

  render();
}