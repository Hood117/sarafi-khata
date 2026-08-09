import {
  CITIES_BY_COUNTRY,
  LOCATION_COUNTRIES,
  type LocationCountryCode,
} from "@/lib/locations/data";

export {
  CITIES_BY_COUNTRY,
  LOCATION_COUNTRIES,
  type LocationCountry,
  type LocationCountryCode,
} from "@/lib/locations/data";

const COUNTRY_NAME_BY_CODE = new Map(
  LOCATION_COUNTRIES.map((country) => [country.code, country.name] as const),
);

const COUNTRY_CODE_BY_NAME = new Map(
  LOCATION_COUNTRIES.map((country) => [
    country.name.toLowerCase(),
    country.code,
  ] as const),
);

const ALL_CITY_NAMES = new Set<string>(
  Object.values(CITIES_BY_COUNTRY).flatMap((cities) => [...cities]),
);

export type LocationOption = {
  value: string;
  label: string;
};

export function listCountryOptions(): LocationOption[] {
  return LOCATION_COUNTRIES.map((country) => ({
    value: country.name,
    label: country.name,
  }));
}

export function getCountryCodeByName(countryName: string): LocationCountryCode | null {
  const trimmed = countryName.trim();
  if (!trimmed) {
    return null;
  }
  return COUNTRY_CODE_BY_NAME.get(trimmed.toLowerCase()) ?? null;
}

export function getCountryNameByCode(code: string): string | null {
  return COUNTRY_NAME_BY_CODE.get(code as LocationCountryCode) ?? null;
}

export function listCityOptions(countryName: string): LocationOption[] {
  const code = getCountryCodeByName(countryName);
  if (!code) {
    return [];
  }

  return CITIES_BY_COUNTRY[code].map((city) => ({
    value: city,
    label: city,
  }));
}

export function isKnownCountry(countryName: string): boolean {
  return getCountryCodeByName(countryName) !== null;
}

export function isKnownCity(cityName: string, countryName?: string): boolean {
  const city = cityName.trim();
  if (!city) {
    return false;
  }

  if (countryName === undefined || countryName.trim() === "") {
    return ALL_CITY_NAMES.has(city);
  }

  const code = getCountryCodeByName(countryName);
  if (!code) {
    return false;
  }

  return (CITIES_BY_COUNTRY[code] as readonly string[]).includes(city);
}

export function isValidLocationPair(
  countryName: string,
  cityName: string,
): boolean {
  return isKnownCountry(countryName) && isKnownCity(cityName, countryName);
}
