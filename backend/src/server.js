import "dotenv/config";
import cors from "cors";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import express from "express";
import { gallery, services } from "./config/services.js";
import {
  createGoogleCalendarEvent,
  getGoogleBusySlots,
  isGoogleCalendarEnabled,
} from "./lib/googleCalendar.js";
import { addBooking, listBookings } from "./lib/store.js";

dayjs.extend(utc);

const app = express();
const PORT = Number(process.env.PORT || 3333);
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const allowedOrigins = [
  FRONTEND_URL,
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

const businessHours = {
  startHour: 9,
  endHour: 19,
  slotMinutes: 30,
};
const BUSINESS_UTC_OFFSET = -3 * 60;
const AVAILABILITY_CACHE_TTL_MS = 60 * 1000;

const corteServiceIds = ["degrade-sombreado", "tesoura", "social", "raspado"];
const availabilityCache = new Map();

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      const isAllowed =
        allowedOrigins.includes(origin)
        || origin.endsWith(".vercel.app");

      if (isAllowed) {
        return callback(null, true);
      }

      return callback(new Error("Origem não permitida pelo CORS."));
    },
  }),
);
app.use(express.json());

function normalizePhone(phone = "") {
  const digits = phone.replace(/\D/g, "");

  if (digits.length <= 11) {
    return digits;
  }

  return digits.slice(-11);
}

function createBusinessDateTime(date, time = "00:00") {
  return dayjs.utc(`${date}T${time}:00Z`).utcOffset(BUSINESS_UTC_OFFSET, true);
}

function toBusinessTime(value) {
  return dayjs(value).utcOffset(BUSINESS_UTC_OFFSET);
}

function findActiveBookingForPhone(bookings, phone) {
  const normalizedPhone = normalizePhone(phone);

  if (!normalizedPhone) {
    return null;
  }

  return bookings.find((booking) => {
    const bookingPhone = booking.normalizedPhone || normalizePhone(booking.phone);
    return bookingPhone === normalizedPhone && dayjs(booking.end).isAfter(dayjs());
  });
}

function getServiceDetails(serviceIds = []) {
  const selectedServices = services.filter((service) => serviceIds.includes(service.id));
  const selectedIds = new Set(selectedServices.map((service) => service.id));
  const hasCorte = corteServiceIds.some((serviceId) => selectedIds.has(serviceId));
  const hasBarba = selectedIds.has("barba");
  const hasBigode = selectedIds.has("bigode");
  const hasSobrancelha = selectedIds.has("sobrancelha");
  const onlyComplementosDeCorte = Array.from(selectedIds).every((id) =>
    corteServiceIds.includes(id) || ["bigode", "sobrancelha"].includes(id),
  );
  const isComboCorteBarba = hasCorte && hasBarba && !selectedIds.has("platinado-completo");
  const isComboCorteComComplemento =
    hasCorte && !hasBarba && (hasBigode || hasSobrancelha) && onlyComplementosDeCorte;
  const isComboBigodeSobrancelha =
    !hasCorte && !hasBarba && hasBigode && hasSobrancelha && selectedIds.size === 2;

  let totalDuration = selectedServices.reduce((sum, service) => sum + service.duration, 0);

  if (isComboCorteBarba) {
    totalDuration = 45;
  } else if (isComboCorteComComplemento) {
    totalDuration = 45;
  } else if (isComboBigodeSobrancelha) {
    totalDuration = 15;
  }

  const totalPrice = selectedServices.reduce((sum, service) => sum + service.price, 0);

  return {
    selectedServices,
    totalDuration,
    totalPrice,
  };
}

function overlaps(slotStart, slotEnd, busyStart, busyEnd) {
  return slotStart.isBefore(busyEnd) && slotEnd.isAfter(busyStart);
}

function buildDaySlots(date) {
  const slots = [];
  let current = createBusinessDateTime(date, `${String(businessHours.startHour).padStart(2, "0")}:00`);
  const end = createBusinessDateTime(date, `${String(businessHours.endHour).padStart(2, "0")}:00`);

  while (current.isBefore(end)) {
    slots.push(current);
    current = current.add(businessHours.slotMinutes, "minute");
  }

  return slots;
}

async function getBusyRanges(date) {
  const localBusy = (await listBookings())
    .filter((booking) => booking.date === date)
    .map((booking) => ({ start: booking.start, end: booking.end }));

  let googleBusy = [];

  try {
    googleBusy = await getGoogleBusySlots(date);
  } catch (error) {
    console.error("Falha ao consultar Google Calendar:", error.message);
  }

  return [...localBusy, ...googleBusy].map((range) => ({
    start: dayjs(range.start),
    end: dayjs(range.end),
  }));
}

function serializeBooking(booking) {
  return {
    id: booking.id,
    date: booking.date,
    start: booking.start,
    end: booking.end,
    time: toBusinessTime(booking.start).format("HH:mm"),
    services: booking.services.map((service) => service.name),
  };
}

function buildAvailabilityCacheKey(date, serviceIds) {
  return `${date}::${serviceIds.slice().sort().join(",") || "sem-serviço"}`;
}

function clearAvailabilityCache(date = null) {
  if (!date) {
    availabilityCache.clear();
    return;
  }

  for (const key of availabilityCache.keys()) {
    if (key.startsWith(`${date}::`)) {
      availabilityCache.delete(key);
    }
  }
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    googleCalendarEnabled: isGoogleCalendarEnabled(),
  });
});

app.get("/api/services", (_req, res) => {
  res.json(services);
});

app.get("/api/gallery", (_req, res) => {
  res.json(gallery);
});

app.get("/api/bootstrap", (_req, res) => {
  res.json({
    services,
    gallery,
  });
});

app.get("/api/availability", async (req, res) => {
  const date = req.query.date;
  const serviceIds = String(req.query.services || "")
    .split(",")
    .filter(Boolean);

  if (!date) {
    return res.status(400).json({ message: "Informe a data." });
  }

  const cacheKey = buildAvailabilityCacheKey(date, serviceIds);
  const cachedResponse = availabilityCache.get(cacheKey);

  if (cachedResponse && Date.now() - cachedResponse.createdAt < AVAILABILITY_CACHE_TTL_MS) {
    return res.json(cachedResponse.data);
  }

  const { totalDuration } = getServiceDetails(serviceIds);
  const appointmentDuration = totalDuration || 30;
  const slots = buildDaySlots(date);
  const dayBookings = (await listBookings()).filter((booking) => booking.date === date);
  const busyRanges = await getBusyRanges(date);

  const availability = slots.map((slot) => {
    const slotEnd = slot.add(appointmentDuration, "minute");
    const exceedsBusinessHours = slotEnd.hour() > businessHours.endHour
      || (slotEnd.hour() === businessHours.endHour && slotEnd.minute() > 0);

    const isBusy = busyRanges.some((busyRange) =>
      overlaps(slot, slotEnd, busyRange.start, busyRange.end),
    );

    return {
      time: slot.format("HH:mm"),
      available: !isBusy && !exceedsBusinessHours && slot.isAfter(dayjs()),
    };
  });

  const responseData = {
    date,
    appointmentDuration,
    slots: availability,
    bookings: dayBookings.map(serializeBooking),
  };

  availabilityCache.set(cacheKey, {
    createdAt: Date.now(),
    data: responseData,
  });

  return res.json(responseData);
});

app.get("/api/bookings", async (req, res) => {
  const date = req.query.date;
  const allBookings = await listBookings();
  const filteredBookings = date ? allBookings.filter((booking) => booking.date === date) : allBookings;

  res.json(filteredBookings.map(serializeBooking));
});

app.post("/api/bookings", async (req, res) => {
  const { name, phone, date, time, serviceIds } = req.body;

  if (!name || !phone || !date || !time || !Array.isArray(serviceIds) || !serviceIds.length) {
    return res.status(400).json({ message: "Preencha todos os dados do agendamento." });
  }

  const { selectedServices, totalDuration, totalPrice } = getServiceDetails(serviceIds);

  if (!selectedServices.length) {
    return res.status(400).json({ message: "Selecione pelo menos um serviço válido." });
  }

  const allBookings = await listBookings();
  const existingBooking = findActiveBookingForPhone(allBookings, phone);

  if (existingBooking) {
    const existingDate = toBusinessTime(existingBooking.start).format("DD/MM/YYYY");
    const existingTime = toBusinessTime(existingBooking.start).format("HH:mm");

    return res.status(409).json({
      message: `Este número já possui um agendamento ativo para ${existingDate} às ${existingTime}. Use outro telefone ou aguarde esse atendimento terminar.`,
    });
  }

  const start = createBusinessDateTime(date, time);
  const end = start.add(totalDuration, "minute");
  const busyRanges = await getBusyRanges(date);
  const conflict = busyRanges.some((busyRange) => overlaps(start, end, busyRange.start, busyRange.end));

  if (conflict) {
    return res.status(409).json({ message: "Esse horário acabou de ser ocupado. Escolha outro." });
  }

  const booking = {
    id: `booking-${Date.now()}`,
    name,
    phone,
    normalizedPhone: normalizePhone(phone),
    date,
    start: start.toISOString(),
    end: end.toISOString(),
    services: selectedServices,
    totalPrice,
    totalDuration,
    source: isGoogleCalendarEnabled() ? "google" : "local",
    createdAt: dayjs().toISOString(),
  };

  try {
    const googleEvent = await createGoogleCalendarEvent(booking);

    if (googleEvent?.id) {
      booking.googleEventId = googleEvent.id;
    }

    await addBooking(booking);
    clearAvailabilityCache(date);

    return res.status(201).json({
      message: googleEvent?.id
        ? "Agendamento criado e enviado para o Google Agenda."
        : "Agendamento criado em modo demonstração. Configure o Google Agenda para sincronizar.",
      booking: {
        ...booking,
        services: booking.services.map((service) => service.name),
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Não foi possível criar o agendamento no Google Agenda.",
      details: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Barbershop backend rodando em http://localhost:${PORT}`);
});
