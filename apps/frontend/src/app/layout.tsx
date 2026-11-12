import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Montaña Redonda Paradise | Sistema POS, Facturación y Control QR',
  description:
    'Sistema Empresarial de Facturación, Ventas Presenciales en Recepción y Control de Actividades Turísticas con Códigos QR - Michés, República Dominicana',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        {/* Carga la configuración editable desde public_html/config.js en Hosting Compartido */}
        <script src="/config.js" />
      </head>
      <body className="min-h-screen bg-earth-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}

