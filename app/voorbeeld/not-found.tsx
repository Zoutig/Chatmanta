import AppNotFound from '../_shell/app-not-found';

// 404 binnen de publieke demo: terug naar het voorbeeld-dashboard.
export default function NotFound() {
  return <AppNotFound homeHref="/voorbeeld" />;
}
