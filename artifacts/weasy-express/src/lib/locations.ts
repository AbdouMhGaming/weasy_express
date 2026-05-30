export interface Location {
  wilayaNumber: number;
  wilaya: string;
  commune?: string;
  address: string;
  phone?: string;
  mapsUrl: string;
  isPrincipal?: boolean;
}

export const locations: Location[] = [
  {
    wilayaNumber: 2,
    wilaya: "Chlef",
    address: "Chlef",
    phone: "0671 72 27 36",
    mapsUrl: "https://maps.app.goo.gl/azNdMzs4VKnuaUfY7",
  },
  {
    wilayaNumber: 16,
    wilaya: "Alger",
    commune: "Draria",
    address: "Draria, Alger",
    phone: "0660 77 63 49",
    mapsUrl: "https://maps.app.goo.gl/YyiYsHhUiaCd8NAe8",
  },
  {
    wilayaNumber: 48,
    wilaya: "Relizane",
    commune: "Oued Rhiou",
    address: "Rue Benkahla Menaouer, Oued Rhiou",
    phone: "0654 97 06 62",
    mapsUrl: "https://maps.app.goo.gl/sCRi9VdRS9sa4vk8A",
    isPrincipal: true,
  },
  {
    wilayaNumber: 48,
    wilaya: "Relizane",
    commune: "Mazouna",
    address: "Mazouna",
    phone: "0660 77 63 39",
    mapsUrl: "https://maps.app.goo.gl/usittQKLifoyCt3e6",
  },
];
