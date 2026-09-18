import "./globals.css";

export const metadata = {
  title: "Pluto Bar",
  description: "Pluto Bar menu — food, cocktails, mocktails, shisha.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans">{children}</body>
    </html>
  );
}
