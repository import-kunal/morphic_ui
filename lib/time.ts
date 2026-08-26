export const CHAT_TIME_ZONE = "Asia/Kolkata";
export const CHAT_TIME_ZONE_LABEL = "IST";

const IST_UTC_OFFSET = "+05:30";
const istDateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: CHAT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

interface IstDateTimeParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
}

export function toIstTimestamp(date = new Date()) {
  const parts = getIstDateTimeParts(date);
  const milliseconds = date.getUTCMilliseconds().toString().padStart(3, "0");
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.${milliseconds}${IST_UTC_OFFSET}`;
}

export function toIstDisplayTime(date = new Date()) {
  const parts = getIstDateTimeParts(date);
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}:${parts.second} ${CHAT_TIME_ZONE_LABEL}`;
}

function getIstDateTimeParts(date: Date): IstDateTimeParts {
  const parts = Object.fromEntries(
    istDateTimeFormatter
      .formatToParts(date)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value])
  );

  return {
    year: parts["year"],
    month: parts["month"],
    day: parts["day"],
    hour: parts["hour"],
    minute: parts["minute"],
    second: parts["second"],
  };
}
