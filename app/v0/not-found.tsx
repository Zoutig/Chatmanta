import AppNotFound from '../_shell/app-not-found';

// 404 binnen de V0-sandbox: terug naar de V0-start (ongewijzigd gedrag).
export default function NotFound() {
  return <AppNotFound homeHref="/v0/home" />;
}
