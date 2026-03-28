import "dotenv/config";
import cors from "cors";
import dayjs from "dayjs";
import express from "express";
import { gallery, services } from "./config/services.js";
import {
  createGoogleCalendarEvent,
  getGoogleBusySlots,
  isGoogleCalendarEnabled,
} from "./lib/googleCalendar.js";

const app = express();
const PORT = Number(process.env.PORT || 3333);
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const allowedOrigins = [
  FRONTEND_URL,
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

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

      return callback(new Error("Origem nao permitida pelo CORS."));
    },
  }),
);
app.use(express.json());

const businessHours = {
  startHour: 9,
  endHour: 19,
  slotMinutes: 30,
};

const corteServiceIds = ["degrade-sombreado", "tesoura", "social", "raspado"];

const bookings = [
  {
    id: "demo-1",
    name: "Cliente da manha",
    email: "cliente@example.com",
    phone: "(11) 99999-0000",
    date: "2026-03-20",
    start: "2026-03-20T09:00:00-03:00",
    end: "2026-03-20T10:00:00-03:00",
    services: services.filter((service) => ["social", "barba"].includes(service.id)),
    source: "demo",
  },
];

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
    totalDuration = 60;
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
  let current = dayjs(date)
    .hour(businessHours.startHour)
    .minute(0)
    .second(0)
    .millisecond(0);
  const end = dayjs(date)
    .hour(businessHours.endHour)
    .minute(0)
    .second(0)
    .millisecond(0);

  while (current.isBefore(end)) {
    slots.push(current);
    current = current.add(businessHours.slotMinutes, "minute");
  }

  return slots;
}

async function getBusyRanges(date) {
  const localBusy = bookings
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

app.get("/api/availability", async (req, res) => {
  const date = req.query.date;
  const serviceIds = String(req.query.services || "")
    .split(",")
    .filter(Boolean);

  if (!date) {
    return res.status(400).json({ message: "Informe a data." });
  }

  const { totalDuration } = getServiceDetails(serviceIds);
  const appointmentDuration = totalDuration || 30;
  const slots = buildDaySlots(date);
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

  return res.json({
    date,
    appointmentDuration,
    slots: availability,
  });
});

app.get("/api/bookings", (req, res) => {
  const date = req.query.date;
  const filteredBookings = date ? bookings.filter((booking) => booking.date === date) : bookings;

  res.json(
    filteredBookings.map((booking) => ({
      id: booking.id,
      date: booking.date,
      start: booking.start,
      end: booking.end,
      time: dayjs(booking.start).format("HH:mm"),
      services: booking.services.map((service) => service.name),
    })),
  );
});

app.post("/api/bookings", async (req, res) => {
  const { name, email, phone, date, time, serviceIds } = req.body;

  if (!name || !email || !phone || !date || !time || !Array.isArray(serviceIds) || !serviceIds.length) {
    return res.status(400).json({ message: "Preencha todos os dados do agendamento." });
  }

  const { selectedServices, totalDuration, totalPrice } = getServiceDetails(serviceIds);

  if (!selectedServices.length) {
    return res.status(400).json({ message: "Selecione pelo menos um servico valido." });
  }

  const start = dayjs(`${date}T${time}:00-03:00`);
  const end = start.add(totalDuration, "minute");
  const busyRanges = await getBusyRanges(date);
  const conflict = busyRanges.some((busyRange) => overlaps(start, end, busyRange.start, busyRange.end));

  if (conflict) {
    return res.status(409).json({ message: "Esse horario acabou de ser ocupado. Escolha outro." });
  }

  const booking = {
    id: `booking-${Date.now()}`,
    name,
    email,
    phone,
    date,
    start: start.toISOString(),
    end: end.toISOString(),
    services: selectedServices,
    totalPrice,
    totalDuration,
    source: isGoogleCalendarEnabled() ? "google" : "local",
  };

  try {
    const googleEvent = await createGoogleCalendarEvent(booking);

    if (googleEvent?.id) {
      booking.googleEventId = googleEvent.id;
    }

    bookings.push(booking);

    return res.status(201).json({
      message: googleEvent?.id
        ? "Agendamento criado e enviado para o Google Agenda."
        : "Agendamento criado em modo demonstracao. Configure o Google Agenda para sincronizar.",
      booking: {
        ...booking,
        services: booking.services.map((service) => service.name),
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Nao foi possivel criar o agendamento no Google Agenda.",
      details: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Barbershop backend rodando em http://localhost:${PORT}`);
});
