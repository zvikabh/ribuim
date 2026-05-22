import { useAuth } from "../composables/useAuth.js";

export default {
  setup() {
    const { signIn, signInError } = useAuth();
    return { signIn, signInError };
  },
  template: `
    <div class="login-screen">
      <h1>Ribu<span>im</span></h1>
      <p>Sign in with your Google account to access your checklists.</p>
      <button class="google-signin-btn" @click="signIn">
        <svg class="google-g" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
          <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.17-1.84H9v3.48h4.84c-.21 1.13-.84 2.09-1.79 2.73v2.27h2.9c1.7-1.57 2.69-3.88 2.69-6.64z"/>
          <path fill="#34A853" d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.9-2.27c-.81.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.71H.96v2.34A9 9 0 0 0 9 18z"/>
          <path fill="#FBBC05" d="M3.95 10.7A5.41 5.41 0 0 1 3.66 9c0-.59.1-1.16.29-1.7V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l2.99-2.34z"/>
          <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96L3.95 7.3C4.66 5.18 6.65 3.58 9 3.58z"/>
        </svg>
        Sign in with Google
      </button>
      <p v-if="signInError" class="text-danger mt-3" style="font-size:0.85rem;">
        {{ signInError }}
      </p>
    </div>
  `
};
