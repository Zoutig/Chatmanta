import AppNotFound from '../_shell/app-not-found';

// 404 van de V0-embed: ongewijzigd gedrag (V0-sandbox; de V1-embed heeft een eigen, transparante 404).
export default function NotFound() {
  return <AppNotFound homeHref="/v0/home" />;
}
