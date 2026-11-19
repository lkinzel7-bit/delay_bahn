export function useWallet() {
  const balance = useState<number | null>("wallet-balance", () => null);
  const user = useSupabaseUser();

  async function refreshBalance() {
    if (!user.value) {
      balance.value = null;
      return;
    }

    try {
      const data = await $fetch<{ balance: number }>("/api/bets");
      balance.value = data.balance;
    } catch {
      balance.value = null;
    }
  }

  function setBalance(newBalance: number) {
    balance.value = newBalance;
  }

  return {
    balance,
    refreshBalance,
    setBalance,
  };
}
