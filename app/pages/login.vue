<script setup lang="ts">
const supabase = useSupabaseClient();
const isRegister = ref(false);
const username = ref("");
const email = ref("");
const password = ref("");
const loading = ref(false);
const errorMsg = ref("");
const infoMsg = ref("");

async function handleSubmit() {
  errorMsg.value = "";
  infoMsg.value = "";

  const cleanEmail = email.value.trim().toLowerCase();
  const rawUsername = username.value.trim();

  if (isRegister.value && !/^[a-zA-Z0-9_-]{3,20}$/.test(rawUsername)) {
    errorMsg.value =
      "Username must be 3–20 characters (letters, numbers, _ or -).";
    return;
  }

  if (password.value.length < 6) {
    errorMsg.value = "Password must be at least 6 characters.";
    return;
  }

  loading.value = true;

  try {
    if (isRegister.value) {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: password.value,
        options: {
          data: { username: rawUsername },
          emailRedirectTo: `${window.location.origin}/login`,
        },
      });
      if (error) throw error;

      // If email confirmation is required, session is null until link is clicked
      if (!data.session) {
        infoMsg.value =
          "Account created. Please check your inbox and confirm your email before signing in.";
        isRegister.value = false;
        password.value = "";
        return;
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: password.value,
      });
      if (error) throw error;
    }

    await navigateTo("/");
  } catch (err: unknown) {
    errorMsg.value =
      err instanceof Error ? err.message : "Authentication failed.";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="auth-card">
    <h1>{{ isRegister ? "Create Account" : "Sign In" }}</h1>

    <form class="auth-form" @submit.prevent="handleSubmit">
      <label v-if="isRegister">
        Username
        <input
          v-model="username"
          type="text"
          placeholder="e.g. bahn_pro"
          required
        />
      </label>

      <label>
        Email
        <input
          v-model="email"
          type="email"
          placeholder="you@example.com"
          required
        />
      </label>

      <label>
        Password
        <input
          v-model="password"
          type="password"
          placeholder="••••••••"
          required
        />
      </label>

      <p v-if="errorMsg" class="error">{{ errorMsg }}</p>
      <p v-if="infoMsg" class="info">{{ infoMsg }}</p>

      <button type="submit" class="btn-submit" :disabled="loading">
        {{ loading ? "Please wait..." : isRegister ? "Register" : "Login" }}
      </button>
    </form>

    <button
      type="button"
      class="toggle-link"
      @click="
        isRegister = !isRegister;
        errorMsg = '';
        infoMsg = '';
      "
    >
      {{
        isRegister
          ? "Already have an account? Sign in"
          : "Need an account? Register"
      }}
    </button>
  </div>
</template>

<style scoped>
.auth-card {
  max-width: 400px;
  margin: 3rem auto;
  padding: 2rem;
  background: #ffffff;
  border: 1px solid #e4e4e7;
  border-radius: 10px;
}
.auth-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 1.25rem;
}
label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.9rem;
  font-weight: 600;
}
input {
  padding: 0.6rem 0.75rem;
  border: 1px solid #d4d4d8;
  border-radius: 6px;
  font-size: 1rem;
}
.error {
  color: #dc2626;
  font-size: 0.875rem;
  margin: 0;
}
.info {
  color: #166534;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  padding: 0.6rem 0.75rem;
  border-radius: 6px;
  font-size: 0.875rem;
  margin: 0;
}
.btn-submit {
  padding: 0.65rem;
  background: #dc2626;
  color: #ffffff;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
}
.btn-submit:disabled {
  opacity: 0.6;
}
.toggle-link {
  margin-top: 1rem;
  background: none;
  border: none;
  color: #52525b;
  text-decoration: underline;
  cursor: pointer;
  font-size: 0.875rem;
  padding: 0;
}
</style>
