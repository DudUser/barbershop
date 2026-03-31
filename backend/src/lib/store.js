import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { services } from "../config/services.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = resolve(__dirname, "../../data/runtime.json");

function buildSeedState() {
  return {
    bookings: [
      {
        id: "demo-1",
        name: "Cliente da manha",
        phone: "(11) 99999-0000",
        date: "2026-03-20",
        start: "2026-03-20T09:00:00-03:00",
        end: "2026-03-20T10:00:00-03:00",
        services: services.filter((service) => ["social", "barba"].includes(service.id)),
        totalPrice: 50,
        totalDuration: 45,
        source: "demo",
        createdAt: "2026-03-20T08:30:00-03:00",
      },
    ],
  };
}

function sanitizeState(data = {}) {
  const seed = buildSeedState();

  return {
    bookings: Array.isArray(data.bookings) ? data.bookings : seed.bookings,
  };
}

let statePromise;
let writeQueue = Promise.resolve();

async function persistState(state) {
  await mkdir(dirname(DATA_FILE), { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(state, null, 2), "utf-8");
}

async function loadState() {
  if (!statePromise) {
    statePromise = (async () => {
      try {
        const raw = await readFile(DATA_FILE, "utf-8");
        return sanitizeState(JSON.parse(raw));
      } catch (error) {
        if (error.code !== "ENOENT") {
          throw error;
        }

        const seed = buildSeedState();
        await persistState(seed);
        return seed;
      }
    })();
  }

  return statePromise;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function mutateState(mutator) {
  const state = await loadState();
  const result = await mutator(state);

  writeQueue = writeQueue.then(() => persistState(state));
  await writeQueue;

  return result;
}

export async function listBookings() {
  const state = await loadState();
  return clone(state.bookings);
}

export async function addBooking(booking) {
  return mutateState((state) => {
    state.bookings.push(booking);
    return clone(booking);
  });
}
