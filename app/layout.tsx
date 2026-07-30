/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from "react";
import "../src/styles.css";

export const metadata = {
  title: "WePuzzle — Make every picture a puzzle",
  description: "Turn your favorite photos into playful, interactive jigsaw puzzles with WePuzzle.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#7654df" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Nunito:wght@500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
