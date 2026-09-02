import type { ReactNode } from "react";

export default function PublicLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <div className="relative min-h-screen bg-paper">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-accent" />
      <div className="pointer-events-none absolute inset-x-0 top-48 h-1 bg-secondary" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-4 py-10">
        {children}
      </div>
    </div>
  );
}
