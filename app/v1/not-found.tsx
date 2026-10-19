import AppNotFound from '../_shell/app-not-found';

// 404 binnen V1: terug naar het klantdashboard (stuurt zonder sessie door naar de login).
export default function NotFound() {
  return <AppNotFound homeHref="/v1/app" />;
}
