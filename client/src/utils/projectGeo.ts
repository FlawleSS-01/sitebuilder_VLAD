import type { GeoPresetRowFallback } from "../constants/createProjectFallback";

export type GeoPresetRow = GeoPresetRowFallback;

export const CUSTOM_GEO = "__CUSTOM__";

export function geoOptionLabel(g: GeoPresetRow): string {
  const camp =
    g.templateCampaignId != null && String(g.templateCampaignId).trim() !== ""
      ? ` · campaign ${g.templateCampaignId}`
      : "";
  return `${g.geoCode} — ${g.geoLabel}${camp}`;
}

export function resolveEditGeoFromProject(
  project: {
    country?: string;
    geoCode?: string | null;
    geoLabel?: string | null;
  },
  presets: GeoPresetRow[]
): { noCountry: boolean; geoSelect: string } {
  if (project.country === "NO COUNTRY") {
    return { noCountry: true, geoSelect: "MULTI" };
  }

  const code = project.geoCode?.trim().toUpperCase();
  if (code && presets.some((g) => g.geoCode === code)) {
    return { noCountry: false, geoSelect: code };
  }

  const labelCandidates = [
    project.geoLabel?.trim(),
    project.country?.trim(),
  ].filter(Boolean) as string[];

  for (const label of labelCandidates) {
    const match = presets.find(
      (g) => g.geoLabel.toLowerCase() === label.toLowerCase()
    );
    if (match) {
      return { noCountry: false, geoSelect: match.geoCode };
    }
  }

  if (project.country?.trim()) {
    return { noCountry: false, geoSelect: CUSTOM_GEO };
  }

  return { noCountry: false, geoSelect: presets[0]?.geoCode || "MULTI" };
}

export function countryFromGeoSelection(
  noCountry: boolean,
  geoSelect: string,
  presets: GeoPresetRow[],
  customCountry: string
): { country: string; geoCode: string | null; geoLabel: string } {
  if (noCountry) {
    return { country: "NO COUNTRY", geoCode: "MULTI", geoLabel: "Multi-GEO" };
  }
  if (geoSelect === CUSTOM_GEO) {
    const label = customCountry.trim();
    return { country: label, geoCode: null, geoLabel: label };
  }
  const row = presets.find((g) => g.geoCode === geoSelect);
  const label = row?.geoLabel || customCountry.trim();
  return {
    country: label,
    geoCode: geoSelect,
    geoLabel: label,
  };
}
