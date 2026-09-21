export const todayMarkerFraction = (date: Date) => Math.floor(date.getHours() / 6) / 4;

export const millisecondsUntilNextTodayMarker = (date: Date) => {
  const next = new Date(date);
  next.setHours((Math.floor(date.getHours() / 6) + 1) * 6, 0, 0, 0);
  return Math.max(1, next.getTime() - date.getTime());
};
