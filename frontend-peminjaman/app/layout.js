import "./globals.css";
import { Poppins } from "next/font/google";

export const metadata = {
  title: "Masuk | Peminjaman Alat",
  description: "Masuk ke sistem peminjaman dan pengelolaan alat.",
};

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
});

export default function RootLayout({ children }) {
  return (
    <html lang="id" className={poppins.variable}>
      <body>{children}</body>
    </html>
  );
}
