export type TodayMarkerStyle = "line" | "band";
export const restoreTodayMarkerStyle = (value: unknown): TodayMarkerStyle => value === "line" ? "line" : "band";
export const TODAY_BAND_DAYS = 2 / 24;
export const todayMarkerFraction = (date: Date) => date.getHours() / 24;

export const millisecondsUntilNextTodayMarker = (date: Date) => {
  const next = new Date(date);
  next.setHours(date.getHours() + 1, 0, 0, 0);
  return Math.max(1, next.getTime() - date.getTime());
};
