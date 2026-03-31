import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import { google } from "googleapis";

dayjs.extend(utc);

const BUSINESS_UTC_OFFSET = -3 * 60;

function createBusinessDateTime(date, hour) {
  return dayjs.utc(`${date}T${String(hour).padStart(2, "0")}:00:00Z`).utcOffset(BUSINESS_UTC_OFFSET, true);
}

const {
  GOOGLE_CALENDAR_ID,
  GOOGLE_SERVICE_ACCOUNT_EMAIL,
  GOOGLE_PRIVATE_KEY,
} = process.env;

function getAuth() {
  if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY || !GOOGLE_CALENDAR_ID) {
    return null;
  }

  return new google.auth.JWT({
    email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
}

function getClient() {
  const auth = getAuth();

  if (!auth) {
    return null;
  }

  return google.calendar({ version: "v3", auth });
}

export function isGoogleCalendarEnabled() {
  return Boolean(getClient());
}

export async function getGoogleBusySlots(date) {
  const client = getClient();

  if (!client) {
    return [];
  }

  const startOfDay = createBusinessDateTime(date, 8);
  const endOfDay = createBusinessDateTime(date, 20);

  const response = await client.freebusy.query({
    requestBody: {
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      items: [{ id: GOOGLE_CALENDAR_ID }],
    },
  });

  return response.data.calendars?.[GOOGLE_CALENDAR_ID]?.busy ?? [];
}

export async function createGoogleCalendarEvent(booking) {
  const client = getClient();

  if (!client) {
    return null;
  }

  const response = await client.events.insert({
    calendarId: GOOGLE_CALENDAR_ID,
    requestBody: {
      summary: `Barbearia - ${booking.name}`,
      description: [
        `Cliente: ${booking.name}`,
        `Telefone: ${booking.phone}`,
        `Serviços: ${booking.services.map((service) => service.name).join(", ")}`,
      ].join("\n"),
      start: {
        dateTime: booking.start,
      },
      end: {
        dateTime: booking.end,
      },
    },
  });

  return response.data;
}
