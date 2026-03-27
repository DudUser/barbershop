import dayjs from "dayjs";
import { google } from "googleapis";

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

  const startOfDay = dayjs(date).hour(8).minute(0).second(0).millisecond(0);
  const endOfDay = dayjs(date).hour(20).minute(0).second(0).millisecond(0);

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
        `Email: ${booking.email}`,
        `Servicos: ${booking.services.map((service) => service.name).join(", ")}`,
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
