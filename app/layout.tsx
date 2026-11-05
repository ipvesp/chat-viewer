import './globals.css';
import type { Metadata } from 'next';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import { ThemeProvider } from 'next-themes';

export const metadata: Metadata = {
  title: 'WhatsApp Sohbet Görüntüleyici',
  description: 'WhatsApp sohbet dosyalarını görüntüleyin ve analiz edin.',
  authors: [{ name: "WhatsApp Sohbet Görüntüleyici" }],
  keywords: ["whatsapp", "sohbet", "görüntüleyici", "chat", "viewer", "export"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr" className="h-full" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      </head>
      <body className="font-sans antialiased h-full dark:bg-[#0a0a0a] dark:text-white transition-colors duration-200">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem={true}
          enableColorScheme={false}
          storageKey="whatsapp-theme"
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
