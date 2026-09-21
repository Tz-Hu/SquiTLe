export const SETTINGS_NAV_MIN=120;
export const SETTINGS_NAV_MAX=300;
export const SETTINGS_DETAIL_MIN=320;
export const SETTINGS_DIVIDER_WIDTH=8;

export function clampSettingsNavWidth(width:number,layoutWidth:number){
  const availableMax=Math.max(SETTINGS_NAV_MIN,layoutWidth-SETTINGS_DETAIL_MIN-SETTINGS_DIVIDER_WIDTH);
  return Math.round(Math.max(SETTINGS_NAV_MIN,Math.min(width,Math.min(SETTINGS_NAV_MAX,availableMax))));
}
