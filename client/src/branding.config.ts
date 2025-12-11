// Keep this file very simple, so others can easily edit it.
export type BrandingConfig = {
defaultUser: string;
  appShortName: string;
  appfaviconDescription: string;
  logoFavicon: string;      // path or URL
  logoHeader: string;
  colors: string[];         // list of hex colors only
  borderRadius: string;     // how big round edges can be (e.g. "8px")
};

export const branding: BrandingConfig = {
    defaultUser: "Preetam",
  appShortName: "NFRF Connect",
  appfaviconDescription: "NFRF Connect Data Assistant",
  logoFavicon: "/assets/logo_favicon.svg",
  logoHeader: "/assets/logo_header.svg",
  colors: [
    "#E60000",
    "#FFFFFF",
    "#1C1C1C",
    "#F2F2F2"
  ],
  borderRadius: "sm"
};