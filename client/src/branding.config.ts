// Keep this file very simple, so others can easily edit it.
export type BrandingConfig = {
  appShortName: string;
  logoFavicon: string;      // path or URL
  logoHeader: string;
  colors: string[];         // list of hex colors only
  borderRadius: string;     // how big round edges can be (e.g. "8px")
};

export const branding: BrandingConfig = {
  appShortName: "NFRF Connect",
  logoFavicon: "/assets/logo_favicon.svg",
  logoHeader: "/assets/logo_header.svg",
  colors: [
    "#E60000",
    "#FFFFFF",
    "#1C1C1C"
  ],
  borderRadius: "sm"
};