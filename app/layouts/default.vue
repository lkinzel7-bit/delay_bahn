<script setup lang="ts">
const supabase = useSupabaseClient();
const user = useSupabaseUser();
const { balance, refreshBalance, setBalance } = useWallet();

watch(
  user,
  (currentUser) => {
    if (currentUser) {
      refreshBalance();
    } else {
      setBalance(0);
    }
  },
  { immediate: true },
);

async function handleLogout() {
  await supabase.auth.signOut();
  await navigateTo("/login");
}
</script>

<template>
  <div class="app-shell">
    <header class="navbar">
      <div class="nav-left">
        <NuxtLink to="/" class="brand">Delay Bahn</NuxtLink>
        <NuxtLink to="/" class="nav-link">Search Trains</NuxtLink>
        <NuxtLink v-if="user" to="/bets" class="nav-link">My Bets</NuxtLink>
      </div>

      <div class="nav-right">
        <template v-if="user">
          <span class="balance-badge">
            Credits: <strong>{{ balance ?? "..." }}</strong>
          </span>
          <button type="button" class="btn-secondary" @click="handleLogout">
            Logout
          </button>
        </template>
        <NuxtLink v-else to="/login" class="btn-primary">
          Login / Register
        </NuxtLink>
      </div>
    </header>

    <main class="container">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  font-family: system-ui, -apple-system, sans-serif;
  background: #f6f7f9;
  color: #18181b;
}
.navbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.85rem 1.5rem;
  background: #ffffff;
  border-bottom: 1px solid #e4e4e7;
}
.nav-left,
.nav-right {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.brand {
  font-weight: 700;
  font-size: 1.15rem;
  color: #dc2626;
  text-decoration: none;
}
.nav-link {
  text-decoration: none;
  color: #3f3f46;
  font-weight: 500;
}
.balance-badge {
  background: #fef2f2;
  color: #991b1b;
  padding: 0.35rem 0.75rem;
  border-radius: 999px;
  font-size: 0.9rem;
}
.container {
  max-width: 900px;
  margin: 2rem auto;
  padding: 0 1rem;
}
.btn-primary,
.btn-secondary {
  padding: 0.45rem 0.9rem;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
  font-size: 0.9rem;
}
.btn-primary {
  background: #dc2626;
  color: #ffffff;
  border: none;
}
.btn-secondary {
  background: #f4f4f5;
  color: #18181b;
  border: 1px solid #d4d4d8;
}
</style>
