import type { Metadata } from "next";
import { Manrope, Source_Sans_3, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

// Display face for headings/UI labels — geometric, available at weight 800,
// matches the rounded-corner, badge-heavy visual language already in use.
const fontDisplay = Manrope({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

// Body face — more neutral/humanist than the display face, easier to read
// in longer description blocks (quiz descriptions, settings help text).
const fontBody = Source_Sans_3({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

// Mono face for IDs, percentages, UTMs — more distinct digits at small sizes
// (slashed zero, serif'd one) than the previous Geist Mono.
const fontMono = JetBrains_Mono({
  variable: "--font-mono-face",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: {
    default: "FunnelFlow — Funis interativos que convertem",
    template: "%s | FunnelFlow",
  },
  description:
    "Crie páginas, formulários e experiências interativas, publique com segurança e acompanhe cada conversão.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${fontDisplay.variable} ${fontBody.variable} ${fontMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background" suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange={false}
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}

