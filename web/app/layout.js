export const metadata = {
  title: 'Smart Clinic Dashboard',
  description: 'Doctor and admin dashboard for Smart Clinic',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
