/**
 * Predefined countries and cities for Sarafi corridor selection.
 * Extend this catalog as needed — do not accept free-text locations in forms.
 */

export type LocationCountry = {
  code: string;
  name: string;
};

/** Stable country codes used as select values. */
export const LOCATION_COUNTRIES = [
  { code: "AF", name: "Afghanistan" },
  { code: "PK", name: "Pakistan" },
  { code: "IR", name: "Iran" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "TR", name: "Turkey" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "QA", name: "Qatar" },
  { code: "OM", name: "Oman" },
  { code: "IN", name: "India" },
  { code: "CN", name: "China" },
  { code: "DE", name: "Germany" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
] as const satisfies readonly LocationCountry[];

export type LocationCountryCode = (typeof LOCATION_COUNTRIES)[number]["code"];

/** Cities keyed by country code. Names are stored as display/persistence values. */
export const CITIES_BY_COUNTRY = {
  AF: [
    "Kabul",
    "Herat",
    "Mazar-i-Sharif",
    "Kandahar",
    "Jalalabad",
    "Kunduz",
    "Ghazni",
    "Balkh",
  ],
  PK: [
    "Karachi",
    "Lahore",
    "Islamabad",
    "Peshawar",
    "Quetta",
    "Rawalpindi",
    "Faisalabad",
  ],
  IR: ["Tehran", "Mashhad", "Isfahan", "Shiraz", "Tabriz", "Zahedan"],
  AE: ["Dubai", "Abu Dhabi", "Sharjah", "Ajman"],
  TR: ["Istanbul", "Ankara", "Izmir", "Antalya", "Bursa"],
  SA: ["Riyadh", "Jeddah", "Mecca", "Medina", "Dammam"],
  QA: ["Doha", "Al Rayyan", "Al Wakrah"],
  OM: ["Muscat", "Salalah", "Sohar"],
  IN: ["Delhi", "Mumbai", "Hyderabad", "Bangalore", "Chennai"],
  CN: ["Beijing", "Shanghai", "Guangzhou", "Yiwu", "Urumqi"],
  DE: ["Berlin", "Frankfurt", "Munich", "Hamburg", "Cologne"],
  GB: ["London", "Birmingham", "Manchester", "Leeds", "Glasgow"],
  US: ["New York", "Los Angeles", "Chicago", "Houston", "Washington"],
} as const satisfies Record<LocationCountryCode, readonly string[]>;
