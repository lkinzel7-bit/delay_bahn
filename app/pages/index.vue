<script setup lang="ts">
interface TrainConnectionResult {
  externalId: string;
  trainName: string;
  trainType: "ICE" | "IC" | "RE" | "OTHER";
  origin: string;
  destination: string;
  scheduledDeparture: string;
  scheduledArrival: string;
  actualArrival: string | null;
  isCancelled: boolean;
}

type PredictionType = "ON_TIME" | "DELAYED";

interface SelectedPick {
  train: TrainConnectionResult;
  prediction: PredictionType;
  multiplier: number;
}

const user = useSupabaseUser();
const { balance, setBalance } = useWallet();

const from = ref("Berlin Hbf");
const to = ref("München Hbf");
const trains = ref<TrainConnectionResult[]>([]);
const searching = ref(false);
const searchError = ref("");
const hasSearched = ref(false);

const selectedPick = ref<SelectedPick | null>(null);
const stake = ref<number>(10);
const placingBet = ref(false);
const betError = ref("");
const betSuccess = ref("");

function getMultiplier(
  trainType: TrainConnectionResult["trainType"],
  prediction: PredictionType,
): number {
  const table: Record<
    TrainConnectionResult["trainType"],
    Record<PredictionType, number>
  > = {
    ICE: { ON_TIME: 2.1, DELAYED: 1.6 },
    IC: { ON_TIME: 1.9, DELAYED: 1.75 },
    RE: { ON_TIME: 1.5, DELAYED: 2.2 },
    OTHER: { ON_TIME: 1.7, DELAYED: 1.9 },
  };
  return table[trainType]?.[prediction] ?? 1.8;
}

const potentialPayout = computed(() => {
  if (!selectedPick.value || !Number.isFinite(stake.value) || stake.value <= 0) {
    return 0;
  }
  return Math.floor(stake.value * selectedPick.value.multiplier);
});

function isBettingClosed(train: TrainConnectionResult): boolean {
  if (train.isCancelled) return true;
  return new Date() >= new Date(train.scheduledDeparture);
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function handleSearch() {
  searchError.value = "";
  betSuccess.value = "";
  searching.value = true;
  hasSearched.value = true;

  try {
    trains.value = await $fetch<TrainConnectionResult[]>("/api/trains/search", {
      query: { from: from.value.trim(), to: to.value.trim() },
    });
  } catch (err: unknown) {
    const fetchErr = err as { data?: { statusMessage?: string }; message?: string };
    searchError.value =
      fetchErr.data?.statusMessage || fetchErr.message || "Search failed.";
    trains.value = [];
  } finally {
    searching.value = false;
  }
}

function selectOutcome(
  train: TrainConnectionResult,
  prediction: PredictionType,
) {
  betError.value = "";
  betSuccess.value = "";
  selectedPick.value = {
    train,
    prediction,
    multiplier: getMultiplier(train.trainType, prediction),
  };
  if (balance.value !== null && stake.value > balance.value) {
    stake.value = Math.max(1, balance.value);
  }
}

async function submitBet() {
  if (!selectedPick.value) return;
  if (!user.value) {
    await navigateTo("/login");
    return;
  }

  betError.value = "";
  betSuccess.value = "";
  placingBet.value = true;

  try {
    const res = await $fetch<{ balance: number }>("/api/bets", {
      method: "POST",
      body: {
        externalId: selectedPick.value.train.externalId,
        prediction: selectedPick.value.prediction,
        stake: Math.floor(stake.value),
      },
    });

    setBalance(res.balance);
    betSuccess.value = `Bet placed on ${selectedPick.value.train.trainName} (${selectedPick.value.prediction === "ON_TIME" ? "On Time" : "Delayed"}).`;
    selectedPick.value = null;
  } catch (err: unknown) {
    const fetchErr = err as { data?: { statusMessage?: string }; message?: string };
    betError.value =
      fetchErr.data?.statusMessage || fetchErr.message || "Could not place bet.";
  } finally {
    placingBet.value = false;
  }
}

onMounted(() => {
  handleSearch();
});
</script>

<template>
  <div class="search-layout">
    <section class="main-column">
      <div class="card search-card">
        <h1>Search Connections</h1>
        <form class="search-form" @submit.prevent="handleSearch">
          <input
            v-model="from"
            type="text"
            placeholder="Origin (e.g. Berlin Hbf)"
            required
          />
          <input
            v-model="to"
            type="text"
            placeholder="Destination (e.g. München Hbf)"
            required
          />
          <button type="submit" class="btn-primary" :disabled="searching">
            {{ searching ? "Searching..." : "Find Trains" }}
          </button>
        </form>
      </div>

      <p v-if="searchError" class="banner error">{{ searchError }}</p>
      <p v-if="betSuccess" class="banner success">{{ betSuccess }}</p>

      <div v-if="searching" class="card empty-state">
        Loading connections...
      </div>

      <div
        v-else-if="hasSearched && trains.length === 0"
        class="card empty-state"
      >
        No connections found for this route.
      </div>

      <div v-else class="train-list">
        <article
          v-for="train in trains"
          :key="train.externalId"
          class="card train-card"
        >
          <div class="train-info">
            <div class="train-header">
              <span class="train-badge">{{ train.trainName }}</span>
              <span v-if="train.isCancelled" class="status-cancelled">
                CANCELLED
              </span>
              <span v-else-if="isBettingClosed(train)" class="status-closed">
                Departed
              </span>
            </div>

            <div class="route-line">
              <strong>{{ formatTime(train.scheduledDeparture) }}</strong>
              {{ train.origin }}
              <span class="arrow">&rarr;</span>
              <strong>{{ formatTime(train.scheduledArrival) }}</strong>
              {{ train.destination }}
            </div>
          </div>

          <div class="odds-actions">
            <button
              type="button"
              class="odds-btn"
              :class="{
                active:
                  selectedPick?.train.externalId === train.externalId &&
                  selectedPick?.prediction === 'ON_TIME',
              }"
              :disabled="isBettingClosed(train)"
              @click="selectOutcome(train, 'ON_TIME')"
            >
              <span>On Time (&lt;6m)</span>
              <strong
                >x{{ getMultiplier(train.trainType, "ON_TIME").toFixed(2) }}</strong
              >
            </button>

            <button
              type="button"
              class="odds-btn"
              :class="{
                active:
                  selectedPick?.train.externalId === train.externalId &&
                  selectedPick?.prediction === 'DELAYED',
              }"
              :disabled="isBettingClosed(train)"
              @click="selectOutcome(train, 'DELAYED')"
            >
              <span>Delayed (&ge;6m)</span>
              <strong
                >x{{ getMultiplier(train.trainType, "DELAYED").toFixed(2) }}</strong
              >
            </button>
          </div>
        </article>
      </div>
    </section>

    <aside class="slip-column">
      <div class="card slip-card">
        <h2>Bet Slip</h2>

        <template v-if="selectedPick">
          <div class="slip-summary">
            <div class="slip-train">{{ selectedPick.train.trainName }}</div>
            <div class="slip-route">
              {{ selectedPick.train.origin }} &rarr;
              {{ selectedPick.train.destination }}
            </div>
            <div class="slip-pick">
              Pick:
              <strong>
                {{
                  selectedPick.prediction === "ON_TIME"
                    ? "On Time (<6 min)"
                    : "Delayed (≥6 min)"
                }}
              </strong>
              @ <strong>x{{ selectedPick.multiplier.toFixed(2) }}</strong>
            </div>
          </div>

          <label class="stake-label">
            Stake (Credits)
            <input
              v-model.number="stake"
              type="number"
              min="1"
              :max="balance ?? undefined"
              step="1"
            />
          </label>

          <div class="quick-stakes">
            <button type="button" @click="stake = 10">10</button>
            <button type="button" @click="stake = 25">25</button>
            <button type="button" @click="stake = 50">50</button>
            <button
              v-if="balance !== null && balance > 0"
              type="button"
              @click="stake = balance"
            >
              Max
            </button>
          </div>

          <div class="payout-row">
            <span>Potential Payout</span>
            <strong>{{ potentialPayout }} Credits</strong>
          </div>

          <p v-if="betError" class="banner error">{{ betError }}</p>

          <button
            v-if="user"
            type="button"
            class="btn-primary full-width"
            :disabled="placingBet || stake < 1 || (balance !== null && stake > balance)"
            @click="submitBet"
          >
            {{ placingBet ? "Placing Bet..." : "Place Bet" }}
          </button>

          <NuxtLink v-else to="/login" class="btn-primary full-width center">
            Sign in to Place Bet
          </NuxtLink>
        </template>

        <p v-else class="empty-slip">
          Select <strong>On Time</strong> or <strong>Delayed</strong> on any
          upcoming train to build your bet.
        </p>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.search-layout {
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: 1.5rem;
  align-items: start;
}
@media (max-width: 768px) {
  .search-layout {
    grid-template-columns: 1fr;
  }
}
.card {
  background: #ffffff;
  border: 1px solid #e4e4e7;
  border-radius: 10px;
  padding: 1.25rem;
}
.search-card h1,
.slip-card h2 {
  margin: 0 0 1rem;
  font-size: 1.15rem;
}
.search-form {
  display: flex;
  gap: 0.65rem;
  flex-wrap: wrap;
}
.search-form input {
  flex: 1;
  min-width: 150px;
  padding: 0.55rem 0.75rem;
  border: 1px solid #d4d4d8;
  border-radius: 6px;
}
.train-list {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  margin-top: 1rem;
}
.train-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}
.train-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
}
.train-badge {
  background: #18181b;
  color: #ffffff;
  font-weight: 700;
  font-size: 0.8rem;
  padding: 0.2rem 0.55rem;
  border-radius: 4px;
}
.status-cancelled {
  color: #dc2626;
  font-weight: 700;
  font-size: 0.78rem;
}
.status-closed {
  color: #71717a;
  font-size: 0.8rem;
}
.route-line {
  font-size: 0.95rem;
  color: #27272a;
}
.arrow {
  margin: 0 0.35rem;
  color: #71717a;
}
.odds-actions {
  display: flex;
  gap: 0.5rem;
}
.odds-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.45rem 0.75rem;
  border: 1px solid #d4d4d8;
  border-radius: 6px;
  background: #fafafa;
  cursor: pointer;
  min-width: 105px;
  font-size: 0.8rem;
}
.odds-btn strong {
  font-size: 0.95rem;
  margin-top: 0.15rem;
}
.odds-btn.active {
  border-color: #dc2626;
  background: #fef2f2;
  color: #991b1b;
}
.odds-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.slip-card {
  position: sticky;
  top: 1.5rem;
}
.slip-summary {
  padding-bottom: 0.85rem;
  border-bottom: 1px solid #e4e4e7;
  margin-bottom: 0.85rem;
  font-size: 0.9rem;
}
.slip-train {
  font-weight: 700;
}
.slip-route {
  color: #52525b;
  margin: 0.2rem 0 0.4rem;
}
.stake-label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.85rem;
  font-weight: 600;
}
.stake-label input {
  padding: 0.5rem 0.65rem;
  border: 1px solid #d4d4d8;
  border-radius: 6px;
  font-size: 1rem;
}
.quick-stakes {
  display: flex;
  gap: 0.4rem;
  margin: 0.5rem 0 1rem;
}
.quick-stakes button {
  flex: 1;
  padding: 0.3rem;
  border: 1px solid #d4d4d8;
  background: #f4f4f5;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
}
.payout-row {
  display: flex;
  justify-content: space-between;
  padding: 0.65rem 0;
  border-top: 1px solid #e4e4e7;
  margin-bottom: 0.85rem;
  font-size: 0.95rem;
}
.btn-primary {
  background: #dc2626;
  color: #ffffff;
  border: none;
  padding: 0.6rem 1rem;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
}
.btn-primary:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.full-width {
  display: block;
  width: 100%;
}
.center {
  text-align: center;
  box-sizing: border-box;
}
.banner {
  padding: 0.65rem 0.85rem;
  border-radius: 6px;
  font-size: 0.88rem;
  margin: 0.75rem 0;
}
.banner.error {
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid #fecaca;
}
.banner.success {
  background: #f0fdf4;
  color: #166534;
  border: 1px solid #bbf7d0;
}
.empty-state,
.empty-slip {
  color: #71717a;
  font-size: 0.9rem;
  margin-top: 1rem;
}
</style>
