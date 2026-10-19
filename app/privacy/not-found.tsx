import AppNotFound from '../_shell/app-not-found';

// 404 onder /privacy: terug naar de marketingsite.
export default function NotFound() {
  return <AppNotFound homeHref="/" />;
}
